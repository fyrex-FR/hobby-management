"""OAuth vendeur eBay, multi-compte : chaque utilisateur de l'app connecte son
propre compte eBay pour pouvoir publier ses cartes en son nom.

Contrairement à ebay_service.py (client credentials, données publiques), ce
module gère le grant "authorization_code" (Authorization Code Grant) : un
token *par utilisateur*, avec refresh_token longue durée (~18 mois) et
access_token courte durée (~2 h), chiffrés au repos.
"""

import base64
import datetime
import hashlib
import hmac
import json
import os
import time
import urllib.parse
from typing import Optional

import httpx

from . import ebay_tokens_store as store
from .ebay_token_crypto import encrypt, decrypt

EBAY_CLIENT_ID = os.getenv("EBAY_CLIENT_ID", "")
EBAY_CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET", "")

# RuName : identifiant de redirection eBay configuré dans le Developer Portal
# (User Tokens (OAuth) -> "Add eBay Redirect URL"). Ce n'est PAS une URL, mais
# un nom que eBay associe à une "Auth accepted URL" / "Auth declined URL"
# pointant toutes deux vers /api/ebay/account/callback de ce backend.
EBAY_RUNAME = os.getenv("EBAY_RUNAME", "")

# Secret de signature du paramètre `state` (CSRF + identification de
# l'utilisateur au retour du callback). Fallback sur le client secret eBay
# pour ne pas exiger une variable de plus en dev, mais une valeur dédiée est
# recommandée en production.
STATE_SECRET = os.getenv("EBAY_OAUTH_STATE_SECRET", "") or EBAY_CLIENT_SECRET

# Où renvoyer l'utilisateur après le callback (succès ou échec).
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://collection.cardvaults.app")

EBAY_AUTHORIZE_URL = "https://auth.ebay.com/oauth2/authorize"
EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_IDENTITY_URL = "https://apiz.ebay.com/commerce/identity/v1/user/"

# Marketplace de vente par défaut (v1 : fixe, un seul marché).
SELL_MARKETPLACE_ID = "EBAY_FR"

# Scopes nécessaires à la vente — tous déjà accordés sur le keyset de
# l'application (Authorization Code Grant Type), aucune approbation
# supplémentaire à demander à eBay.
SELL_SCOPES = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
]

STATE_TTL_SECONDS = 600  # 10 min pour compléter le consentement eBay


class OAuthError(Exception):
    pass


def _basic_auth_header() -> str:
    creds = base64.b64encode(f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}".encode()).decode()
    return f"Basic {creds}"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def sign_state(user_id: str) -> str:
    """State signé (HMAC) liant la redirection eBay à l'utilisateur qui a
    initié la connexion — pas de stockage serveur nécessaire (stateless)."""
    payload = json.dumps({"uid": user_id, "exp": int(time.time()) + STATE_TTL_SECONDS}).encode()
    sig = hmac.new(STATE_SECRET.encode(), payload, hashlib.sha256).digest()
    return f"{_b64url(payload)}.{_b64url(sig)}"


def verify_state(state: str) -> str:
    """Vérifie la signature + l'expiration, retourne le user_id ou lève OAuthError."""
    try:
        payload_b64, sig_b64 = state.split(".", 1)
        payload = _b64url_decode(payload_b64)
        sig = _b64url_decode(sig_b64)
    except Exception as e:
        raise OAuthError(f"state malformé: {e}")

    expected_sig = hmac.new(STATE_SECRET.encode(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        raise OAuthError("state invalide (signature)")

    data = json.loads(payload)
    if data.get("exp", 0) < time.time():
        raise OAuthError("state expiré, recommence la connexion")
    uid = data.get("uid")
    if not uid:
        raise OAuthError("state sans utilisateur")
    return uid


def build_authorize_url(user_id: str) -> str:
    if not EBAY_CLIENT_ID or not EBAY_RUNAME:
        raise OAuthError("EBAY_CLIENT_ID / EBAY_RUNAME non configurés")
    params = {
        "client_id": EBAY_CLIENT_ID,
        "redirect_uri": EBAY_RUNAME,
        "response_type": "code",
        "scope": " ".join(SELL_SCOPES),
        "state": sign_state(user_id),
    }
    return f"{EBAY_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Échange le code d'autorisation contre access_token + refresh_token."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            EBAY_TOKEN_URL,
            headers={
                "Authorization": _basic_auth_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": EBAY_RUNAME,
            },
        )
    if resp.status_code != 200:
        raise OAuthError(f"échange du code refusé (HTTP {resp.status_code}): {resp.text[:300]}")
    return resp.json()


async def _refresh(refresh_token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            EBAY_TOKEN_URL,
            headers={
                "Authorization": _basic_auth_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": " ".join(SELL_SCOPES),
            },
        )
    if resp.status_code != 200:
        raise OAuthError(f"refresh refusé (HTTP {resp.status_code}): {resp.text[:300]}")
    return resp.json()


async def fetch_ebay_username(access_token: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                EBAY_IDENTITY_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            return None
        return resp.json().get("username")
    except Exception:
        return None


async def save_new_connection(user_id: str, token_data: dict) -> None:
    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]
    expires_at = time.time() + token_data.get("expires_in", 7200)
    username = await fetch_ebay_username(access_token)

    await store.upsert_row(user_id, {
        "refresh_token": encrypt(refresh_token),
        "access_token": encrypt(access_token),
        "access_token_expires_at": _iso(expires_at),
        "ebay_username": username,
        "marketplace_id": SELL_MARKETPLACE_ID,
    })


async def get_status(user_id: str) -> dict:
    row = await store.get_row(user_id)
    if not row:
        return {"connected": False}
    return {
        "connected": True,
        "ebay_username": row.get("ebay_username"),
        "marketplace_id": row.get("marketplace_id"),
        "connected_at": row.get("connected_at"),
    }


async def disconnect(user_id: str) -> None:
    await store.delete_row(user_id)


async def get_valid_access_token(user_id: str) -> Optional[str]:
    """Access token utilisable pour appeler les APIs de vente au nom de
    l'utilisateur — rafraîchi automatiquement si expiré. None si non connecté
    ou si le refresh échoue (token révoqué : l'utilisateur doit se reconnecter)."""
    row = await store.get_row(user_id)
    if not row:
        return None

    expires_at = _parse_iso(row.get("access_token_expires_at"))
    if expires_at and expires_at - 60 > time.time():
        return decrypt(row["access_token"])

    try:
        refresh_token = decrypt(row["refresh_token"])
        token_data = await _refresh(refresh_token)
    except OAuthError:
        return None

    access_token = token_data["access_token"]
    new_expires_at = time.time() + token_data.get("expires_in", 7200)
    await store.upsert_row(user_id, {
        "refresh_token": row["refresh_token"],  # inchangé
        "access_token": encrypt(access_token),
        "access_token_expires_at": _iso(new_expires_at),
        "ebay_username": row.get("ebay_username"),
        "marketplace_id": row.get("marketplace_id") or SELL_MARKETPLACE_ID,
    })
    return access_token


def _iso(ts: float) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()


def _parse_iso(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None
