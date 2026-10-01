"""Module Salon : stand public par QR, paniers visiteurs, encaissement.

Gestion réservée à l'admin (`require_admin`). Les routes publiques ne servent
que le stock `a_vendre` du compte propriétaire du stand.
"""
import asyncio
import hashlib
import hmac
import logging
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .admin import require_admin
from .cards import fetch_all_rows
from services import ebay_selling
from services.ebay_oauth import get_valid_access_token
from services.share_public import public_card

router = APIRouter()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
HOLD_MINUTES = 30
MAX_CART = 50
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _check(resp: httpx.Response, ok=(200, 201, 204)):
    if resp.status_code not in ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp


def _price(card: dict) -> Optional[float]:
    return public_card(card, True).get("price")


SLIM_FIELDS = (
    "id", "sport", "player", "team", "year", "brand", "set_name", "insert_name", "parallel_name", "card_number",
    "card_type", "numbered", "is_rookie", "image_front_url", "image_back_url", "condition_notes",
    "grading_company", "grading_grade", "created_at",
)


def _slim(card: dict) -> dict:
    return {**{k: card.get(k) for k in SLIM_FIELDS}, "price": _price(card)}


def _money(v) -> float:
    return round(float(v), 2)


def spread(asked: list[float], total: float) -> list[float]:
    """Répartit un prix de lot au prorata des prix demandés, au centime près.

    La somme des parts vaut exactement `total` : l'arrondi résiduel va sur la
    ligne la plus chère. Sert à garder un prix de vente par carte quand
    l'acheteur négocie le lot entier.
    """
    if not asked:
        return []
    weights = [round(a * 100) for a in asked]
    base = sum(weights)
    cents = round(total * 100)
    if base <= 0:
        weights, base = [1] * len(asked), len(asked)
    parts = [w * cents // base for w in weights]
    parts[max(range(len(asked)), key=lambda i: weights[i])] += cents - sum(parts)
    return [p / 100 for p in parts]


def offer_summary(lines: list[dict]) -> dict:
    """Vue « lot » des lignes : total demandé, offre, état de la négociation."""
    asked = _money(sum(l["asked"] for l in lines))
    offered = [l for l in lines if l.get("offer") is not None]
    states = {l.get("state") for l in offered}
    if not offered:
        state = "none"
    elif "offered" in states:
        state = "offered"
    elif "countered" in states:
        state = "countered"
    elif states == {"accepted"}:
        state = "accepted"
    else:
        state = "refused"
    offer = _money(sum(l["offer"] for l in offered)) if offered else None
    return {"asked": asked, "offer": offer, "offer_state": state}


def _buyer_key(cart_id: str) -> str:
    """Clé du visiteur pour modifier sa réservation, dérivée de l'id (pas de colonne en base)."""
    secret = (os.environ.get("SALON_SECRET") or SUPABASE_SERVICE_KEY or "cardvaults-salon").encode()
    return hmac.new(secret, f"salon-cart:{cart_id}".encode(), hashlib.sha256).hexdigest()[:24]


async def _stand_by_token(client: httpx.AsyncClient, token: str) -> dict:
    resp = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"token": f"eq.{token}", "limit": "1"}), (200,))
    rows = resp.json()
    if not rows or not rows[0].get("is_open"):
        raise HTTPException(status_code=404, detail="Stand fermé ou introuvable")
    return rows[0]


async def _active_carts(client: httpx.AsyncClient, user_id: str) -> list[dict]:
    resp = _check(await client.get(
        f"{SUPABASE_URL}/rest/v1/salon_carts",
        headers=_headers(),
        params={"user_id": f"eq.{user_id}", "status": "eq.active", "expires_at": f"gt.{_iso(_now())}"},
    ), (200,))
    return resp.json()


# ── Public ───────────────────────────────────────────────────────────────────

@router.get("/salon/{token}/stock")
async def public_stock(token: str):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", {"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "order": "created_at.desc"})
        carts = await _active_carts(client, user_id)
    cards = [_slim(c) for c in cards]
    cards = [c for c in cards if c.get("price") is not None]
    reserved = sorted({cid for cart in carts for cid in cart["card_ids"]})
    return {"title": stand.get("title"), "hold_minutes": HOLD_MINUTES, "paypal_me": stand.get("paypal_me"), "cards": cards, "reserved": reserved}


@router.get("/salon/{token}/live")
async def public_live(token: str):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        carts = await _active_carts(client, user_id)
        paid = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(),
            params={"user_id": f"eq.{user_id}", "status": "eq.paid", "select": "card_ids"},
        ), (200,)).json()
    return {
        "reserved": sorted({cid for cart in carts for cid in cart["card_ids"]}),
        "sold": sorted({cid for cart in paid for cid in cart["card_ids"]}),
    }


class CartBody(BaseModel):
    card_ids: list[str]
    pseudo: Optional[str] = None
    # Offre sur le lot entier (le cas normal).
    offer: Optional[float] = None
    # Ancien format : offre carte par carte. Gardé pour les pages déjà ouvertes.
    offers: dict[str, float] = {}
    key: Optional[str] = None
    # Identifiant anonyme du navigateur, pour l'entonnoir des statistiques.
    visitor: Optional[str] = None


class BuyerKey(BaseModel):
    key: str


def _clean_ids(card_ids: list[str]) -> list[str]:
    try:
        ids = list(dict.fromkeys(str(uuid.UUID(c)) for c in card_ids))[:MAX_CART]
    except ValueError:
        raise HTTPException(status_code=400, detail="Carte invalide")
    if not ids:
        raise HTTPException(status_code=400, detail="Panier vide")
    return ids


async def _reservable(client: httpx.AsyncClient, user_id: str, ids: list[str], except_cart: Optional[str] = None) -> tuple[dict, list[dict]]:
    """Cartes à vendre, avec prix, non bloquées par un autre panier. 409 sinon."""
    resp = _check(await client.get(
        f"{SUPABASE_URL}/rest/v1/cards",
        headers=_headers(),
        params={"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "id": f"in.({','.join(ids)})"},
    ), (200,))
    found = {c["id"]: c for c in resp.json()}
    active = await _active_carts(client, user_id)
    taken = {cid for cart in active if cart["id"] != except_cart for cid in cart["card_ids"]}
    unavailable = [i for i in ids if i not in found or _price(found[i]) is None or i in taken]
    if unavailable:
        raise HTTPException(status_code=409, detail={"unavailable": unavailable})
    return found, active


def _build_lines(ids: list[str], found: dict, body: CartBody) -> list[dict]:
    asked = [_money(_price(found[i])) for i in ids]
    if body.offer is not None:
        if not (0 < body.offer < sum(asked)):
            raise HTTPException(status_code=400, detail="Offre invalide")
        shares = spread(asked, _money(body.offer))
        return [{"card_id": i, "asked": a, "offer": o, "final": a, "state": "offered"} for i, a, o in zip(ids, asked, shares)]
    lines = []
    for i, a in zip(ids, asked):
        offer = body.offers.get(i)
        if offer is not None and not (0 < offer < a):
            raise HTTPException(status_code=400, detail="Offre invalide")
        lines.append({"card_id": i, "asked": a, "offer": _money(offer) if offer is not None else None, "final": a, "state": "offered" if offer is not None else "none"})
    return lines


@router.post("/salon/{token}/carts", status_code=201)
async def create_cart(token: str, body: CartBody):
    ids = _clean_ids(body.card_ids)
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        found, active = await _reservable(client, user_id, ids)
        lines = _build_lines(ids, found, body)
        mine = {c["code"] for c in active}
        code = next(c for c in (("".join(secrets.choice(CODE_ALPHABET) for _ in range(4))) for _ in range(50)) if c not in mine)
        ins = _check(await client.post(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), json={
            "user_id": user_id,
            "code": code,
            "card_ids": ids,
            "lines": lines,
            "total": _money(sum(l["final"] for l in lines)),
            "pseudo": (body.pseudo or "").strip()[:60] or None,
            "expires_at": _iso(_now() + timedelta(minutes=HOLD_MINUTES)),
        }))
        cart = ins.json()[0]
        if body.visitor:
            await _log_events(client, user_id, body.visitor, [{"kind": "reserve", "cart_id": cart["id"]}])
    return {"code": cart["code"], "key": _buyer_key(cart["id"]), "total": cart["total"], "expires_at": cart["expires_at"]}


async def _public_cart_row(client: httpx.AsyncClient, user_id: str, code: str, key: Optional[str]) -> dict:
    """Panier d'un visiteur. Un code n'est unique que parmi les paniers actifs :
    avec la clé on retrouve toujours le bon, même si le code a été réattribué."""
    rows = _check(await client.get(
        f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(),
        params={"user_id": f"eq.{user_id}", "code": f"eq.{code.upper()}", "order": "created_at.desc"},
    ), (200,)).json()
    if key:
        rows = [r for r in rows if hmac.compare_digest(_buyer_key(r["id"]), key)]
    if not rows:
        raise HTTPException(status_code=404, detail="Panier introuvable")
    return rows[0]


def _require_key(cart: dict, key: Optional[str]):
    if not key or not hmac.compare_digest(_buyer_key(cart["id"]), key):
        raise HTTPException(status_code=403, detail="Ce panier ne t'appartient pas")


def _status(cart: dict) -> str:
    if cart["status"] == "active" and cart["expires_at"] <= _iso(_now()):
        return "expired"
    return cart["status"]


@router.get("/salon/{token}/carts/{code}")
async def public_cart(token: str, code: str, key: Optional[str] = None):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        cart = await _public_cart_row(client, stand["user_id"], code, key)
        cards = {}
        if cart["card_ids"]:
            found = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"id": f"in.({','.join(cart['card_ids'])})"}), (200,)).json()
            cards = {c["id"]: c for c in found}
    lines = cart.get("lines") or []
    pub_lines = [{
        **l,
        "player": cards.get(l["card_id"], {}).get("player"),
        "set_name": cards.get(l["card_id"], {}).get("set_name"),
        "year": cards.get(l["card_id"], {}).get("year"),
        "image_front_url": cards.get(l["card_id"], {}).get("image_front_url"),
    } for l in lines]
    return {
        "code": cart["code"],
        "status": _status(cart),
        "total": cart["total"],
        "expires_at": cart["expires_at"],
        "card_ids": cart["card_ids"],
        "lines": pub_lines,
        **offer_summary(lines),
    }


@router.put("/salon/{token}/carts/{code}")
async def update_public_cart(token: str, code: str, body: CartBody):
    """Le visiteur modifie sa réservation (ajout/retrait de cartes, nouvelle offre).
    Le code ne change pas ; la négociation repart de zéro et la réservation est prolongée."""
    ids = _clean_ids(body.card_ids)
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        cart = await _public_cart_row(client, user_id, code, body.key)
        _require_key(cart, body.key)
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier déjà encaissé ou annulé")
        found, _ = await _reservable(client, user_id, ids, except_cart=cart["id"])
        lines = _build_lines(ids, found, body)
        payload = {
            "card_ids": ids,
            "lines": lines,
            "total": _money(sum(l["final"] for l in lines)),
            "expires_at": _iso(_now() + timedelta(minutes=HOLD_MINUTES)),
        }
        if body.pseudo is not None:
            payload["pseudo"] = body.pseudo.strip()[:60] or None
        updated = await _set_cart(client, cart["id"], user_id, payload)
    return {"code": updated["code"], "key": body.key, "total": updated["total"], "expires_at": updated["expires_at"]}


@router.post("/salon/{token}/carts/{code}/cancel")
async def cancel_public_cart(token: str, code: str, body: BuyerKey):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        cart = await _public_cart_row(client, stand["user_id"], code, body.key)
        _require_key(cart, body.key)
        if cart["status"] == "paid":
            raise HTTPException(status_code=409, detail="Panier déjà encaissé")
        await _set_cart(client, cart["id"], stand["user_id"], {"status": "cancelled"})
    return {"status": "cancelled"}


@router.post("/salon/{token}/carts/{code}/accept")
async def accept_counter(token: str, code: str, body: BuyerKey):
    """Le visiteur accepte la contre-offre du vendeur."""
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        cart = await _public_cart_row(client, stand["user_id"], code, body.key)
        _require_key(cart, body.key)
        if _status(cart) != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        lines = cart.get("lines") or []
        for l in lines:
            if l.get("state") == "countered":
                l["state"] = "accepted"
        await _set_cart(client, cart["id"], stand["user_id"], {"lines": lines})
    return {"status": "active", **offer_summary(lines)}


# ── Statistiques : événements anonymes ───────────────────────────────────────

EVENT_KINDS = {"visit", "view", "add", "cart", "search", "search_empty"}
MAX_EVENTS = 50
VISITOR_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")


async def _log_events(client: httpx.AsyncClient, user_id: str, visitor: str, events: list[dict]):
    """Écriture au mieux : sans la table (migration pas encore passée) ou en cas
    d'erreur, la page du stand doit continuer de marcher."""
    if not VISITOR_RE.fullmatch(visitor or "") or not events:
        return
    rows = [{"user_id": user_id, "visitor": visitor, "kind": e["kind"], "card_id": e.get("card_id"), "cart_id": e.get("cart_id"), **({"query": e["query"]} if e.get("query") else {})} for e in events]
    url = f"{SUPABASE_URL}/rest/v1/salon_events"
    headers = {**_headers(), "Prefer": "return=minimal"}
    try:
        resp = await client.post(url, headers=headers, json=rows)
        # Colonne `query` absente (migration add_salon_search pas encore passée) :
        # on garde au moins les autres événements.
        if resp.status_code >= 300 and any("query" in r for r in rows):
            rest = [r for r in rows if "query" not in r]
            if rest:
                await client.post(url, headers=headers, json=rest)
    except httpx.HTTPError:
        pass


@router.post("/salon/{token}/events", status_code=204)
async def public_events(token: str, request: Request):
    """Lot d'événements de la page publique. Corps JSON envoyé en text/plain
    (fetch keepalive sans pré-vol CORS) : on le lit à la main."""
    try:
        body = json.loads(await request.body() or b"{}")
        visitor = str(body.get("visitor") or "")
        raw = body.get("events") or []
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Corps invalide")
    events = []
    for e in raw[:MAX_EVENTS] if isinstance(raw, list) else []:
        kind = e.get("kind") if isinstance(e, dict) else None
        if kind not in EVENT_KINDS:
            continue
        card_id = e.get("card_id")
        try:
            card_id = str(uuid.UUID(card_id)) if card_id else None
        except (ValueError, TypeError):
            card_id = None
        query = None
        if kind in ("search", "search_empty"):
            query = " ".join(str(e.get("query") or "").lower().split())[:60]
            if len(query) < 2:
                continue
        events.append({"kind": kind, "card_id": card_id, "query": query})
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        await _log_events(client, stand["user_id"], visitor, events)
    return Response(status_code=204)


# ── Admin ────────────────────────────────────────────────────────────────────

class StandUpdate(BaseModel):
    is_open: Optional[bool] = None
    title: Optional[str] = None
    paypal_me: Optional[str] = None


@router.get("/salon/stand")
async def get_stand(user: dict = Depends(require_admin)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"user_id": f"eq.{user_id}"}), (200,)).json()
        if rows:
            return rows[0]
        ins = _check(await client.post(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), json={"user_id": user_id, "token": secrets.token_urlsafe(9)}))
    return ins.json()[0]


@router.patch("/salon/stand")
async def update_stand(body: StandUpdate, user: dict = Depends(require_admin)):
    payload = body.model_dump(exclude_none=True)
    if "paypal_me" in payload:
        handle = payload["paypal_me"].strip().removeprefix("https://www.paypal.me/").removeprefix("https://paypal.me/").strip("/")
        if handle and not re.fullmatch(r"[A-Za-z0-9.]{1,40}", handle):
            raise HTTPException(status_code=400, detail="Pseudo PayPal.me invalide")
        payload["paypal_me"] = handle or None
    async with httpx.AsyncClient() as client:
        resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"user_id": f"eq.{user['sub']}"}, json=payload))
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Stand introuvable")
    return rows[0]


async def _with_cards(client: httpx.AsyncClient, carts: list[dict]) -> list[dict]:
    ids = sorted({cid for c in carts for cid in c["card_ids"]})
    cards: dict = {}
    if ids:
        rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"id": f"in.({','.join(ids)})"}), (200,)).json()
        cards = {c["id"]: public_card(c, True) for c in rows}
    return [{**c, "cards": [cards[i] for i in c["card_ids"] if i in cards]} for c in carts]


@router.get("/salon/carts")
async def list_carts(user: dict = Depends(require_admin)):
    since = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    async with httpx.AsyncClient() as client:
        resp = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts",
            headers=_headers(),
            params={"user_id": f"eq.{user['sub']}", "created_at": f"gte.{_iso(since)}", "order": "created_at.desc"},
        ), (200,))
        return await _with_cards(client, resp.json())


@router.get("/salon/carts/by-code/{code}")
async def cart_by_code(code: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        resp = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts",
            headers=_headers(),
            params={"user_id": f"eq.{user['sub']}", "code": f"eq.{code.upper()}", "order": "created_at.desc", "limit": "1"},
        ), (200,))
        rows = resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Panier introuvable")
        return (await _with_cards(client, rows))[0]


async def _get_cart(client: httpx.AsyncClient, cart_id: str, user_id: str) -> dict:
    resp = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), params={"id": f"eq.{cart_id}", "user_id": f"eq.{user_id}"}), (200,))
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Panier introuvable")
    return rows[0]


async def _set_cart(client: httpx.AsyncClient, cart_id: str, user_id: str, payload: dict) -> dict:
    resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), params={"id": f"eq.{cart_id}", "user_id": f"eq.{user_id}"}, json=payload))
    return resp.json()[0]


class LineUpdate(BaseModel):
    final: Optional[float] = None
    state: Optional[str] = None


@router.patch("/salon/carts/{cart_id}/lines/{card_id}")
async def update_line(cart_id: str, card_id: str, body: LineUpdate, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        lines = cart.get("lines") or []
        line = next((l for l in lines if l["card_id"] == card_id), None)
        if line is None:
            raise HTTPException(status_code=404, detail="Ligne introuvable")
        if body.state == "accepted" and line.get("offer") is not None:
            line["final"], line["state"] = line["offer"], "accepted"
        elif body.state == "refused":
            line["final"], line["state"] = line["asked"], "refused"
        elif body.final is not None:
            if body.final <= 0:
                raise HTTPException(status_code=400, detail="Prix invalide")
            line["final"] = _money(body.final)
            if line.get("offer") is not None:
                line["state"] = "accepted" if line["final"] == line["offer"] else "countered"
        else:
            raise HTTPException(status_code=400, detail="Rien à modifier")
        total = _money(sum(l["final"] for l in lines))
        return await _set_cart(client, cart_id, user["sub"], {"lines": lines, "total": total})


class OfferAction(BaseModel):
    action: str  # accept | refuse | counter
    total: Optional[float] = None


@router.post("/salon/carts/{cart_id}/offer")
async def answer_offer(cart_id: str, body: OfferAction, user: dict = Depends(require_admin)):
    """Réponse du vendeur sur le lot entier. `counter` fixe un prix de lot,
    réparti sur les cartes au prorata (utilisable aussi comme remise sans offre)."""
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        lines = cart.get("lines") or []
        if not lines:
            raise HTTPException(status_code=400, detail="Panier sans lignes")
        has_offer = any(l.get("offer") is not None for l in lines)
        if body.action == "accept":
            if not has_offer:
                raise HTTPException(status_code=400, detail="Aucune offre à accepter")
            for l in lines:
                if l.get("offer") is not None:
                    l["final"], l["state"] = l["offer"], "accepted"
        elif body.action == "refuse":
            for l in lines:
                l["final"] = l["asked"]
                if l.get("offer") is not None:
                    l["state"] = "refused"
        elif body.action == "counter":
            if body.total is None or body.total <= 0:
                raise HTTPException(status_code=400, detail="Prix invalide")
            finals = spread([l["asked"] for l in lines], _money(body.total))
            for l, f in zip(lines, finals):
                l["final"] = f
                if l.get("offer") is not None:
                    l["state"] = "accepted" if f == l["offer"] else "countered"
        else:
            raise HTTPException(status_code=400, detail="Action inconnue")
        total = _money(sum(l["final"] for l in lines))
        return await _set_cart(client, cart_id, user["sub"], {"lines": lines, "total": total})


# ── Vente : statut, annonces en ligne ────────────────────────────────────────

async def _withdraw_ebay(user_id: str, cards: list[dict]) -> dict:
    """Retire les annonces eBay des cartes vendues au salon (évite la double
    vente). Au mieux : un échec n'annule jamais l'encaissement, la carte reste
    alors dans la liste « à retirer »."""
    listed = [c for c in cards if c.get("ebay_offer_id")]
    if not listed:
        return {"withdrawn": 0, "failed": []}
    try:
        token = await get_valid_access_token(user_id)
    except Exception:
        logger.exception("Salon : jeton eBay indisponible")
        token = None
    if not token:
        return {"withdrawn": 0, "failed": [c["id"] for c in listed]}
    results = await asyncio.gather(*(ebay_selling.withdraw_card(c, token) for c in listed), return_exceptions=True)
    failed = []
    for c, r in zip(listed, results):
        if isinstance(r, Exception):
            logger.warning("Salon : retrait eBay impossible pour %s : %s", c["id"], r)
            failed.append(c["id"])
    return {"withdrawn": len(listed) - len(failed), "failed": failed}


async def _sell_cards(client: httpx.AsyncClient, user_id: str, ids: list[str], finals: dict) -> dict:
    """Passe les cartes en vendu au prix final, puis s'occupe des annonces :
    retrait eBay automatique, liste des annonces Vinted à retirer à la main."""
    rows = _check(await client.get(
        f"{SUPABASE_URL}/rest/v1/cards",
        headers=_headers(),
        params={"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "id": f"in.({','.join(ids)})"},
    ), (200,)).json()
    gone = [i for i in ids if i not in {c["id"] for c in rows}]
    if gone:
        raise HTTPException(status_code=409, detail={"unavailable": gone})
    for cid in ids:
        payload = {"status": "vendu", "is_listed": False}
        if cid in finals:
            payload["price"] = finals[cid]
        _check(await client.patch(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "id": f"eq.{cid}"}, json=payload))
    ebay = await _withdraw_ebay(user_id, rows)
    return {"ebay_withdrawn": ebay["withdrawn"], "ebay_failed": ebay["failed"], "vinted": [c["id"] for c in rows if c.get("vinted_url")]}


@router.post("/salon/carts/{cart_id}/pay")
async def pay_cart(cart_id: str, user: dict = Depends(require_admin)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user_id)
        if cart["status"] == "paid":
            return cart
        finals = {l["card_id"]: l["final"] for l in (cart.get("lines") or [])}
        market = await _sell_cards(client, user_id, cart["card_ids"], finals)
        paid = await _set_cart(client, cart_id, user_id, {"status": "paid", "paid_at": _iso(_now())})
    return {**paid, "marketplaces": market}


class Checkout(BaseModel):
    card_ids: list[str]
    # Prix final par carte (prix affiché si absent)…
    prices: dict[str, float] = {}
    # …ou un prix pour tout le lot, réparti au prorata.
    total: Optional[float] = None


@router.post("/salon/checkout", status_code=201)
async def quick_checkout(body: Checkout, user: dict = Depends(require_admin)):
    """Caisse rapide : vente directe depuis le téléphone du vendeur, sans panier
    visiteur. Enregistrée comme un panier encaissé pour le bilan."""
    ids = _clean_ids(body.card_ids)
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        found, active = await _reservable(client, user_id, ids)
        asked = [_money(_price(found[i])) for i in ids]
        if body.total is not None:
            if body.total <= 0:
                raise HTTPException(status_code=400, detail="Prix invalide")
            finals = spread(asked, _money(body.total))
        else:
            finals = [_money(body.prices.get(i, a)) for i, a in zip(ids, asked)]
            if any(f <= 0 for f in finals):
                raise HTTPException(status_code=400, detail="Prix invalide")
        lines = [{"card_id": i, "asked": a, "offer": None, "final": f, "state": "none"} for i, a, f in zip(ids, asked, finals)]
        market = await _sell_cards(client, user_id, ids, {l["card_id"]: l["final"] for l in lines})
        mine = {c["code"] for c in active}
        code = next(c for c in (("".join(secrets.choice(CODE_ALPHABET) for _ in range(4))) for _ in range(50)) if c not in mine)
        now = _iso(_now())
        cart = _check(await client.post(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), json={
            "user_id": user_id,
            "code": code,
            "card_ids": ids,
            "lines": lines,
            "total": _money(sum(finals)),
            "pseudo": "Caisse",
            "status": "paid",
            "paid_at": now,
            "expires_at": now,
        })).json()[0]
    return {**cart, "marketplaces": market}


@router.get("/salon/delist")
async def to_delist(user: dict = Depends(require_admin)):
    """Cartes vendues au salon dont une annonce est encore en ligne :
    Vinted (à retirer à la main, pas d'API) ou eBay (retrait automatique raté)."""
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        carts = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/salon_carts", {"user_id": f"eq.{user_id}", "status": "eq.paid", "select": "card_ids,paid_at", "order": "paid_at.desc"})
        sold_at = {}
        for c in carts:
            for cid in c["card_ids"]:
                sold_at.setdefault(cid, c.get("paid_at"))
        ids = list(sold_at)
        out = []
        for i in range(0, len(ids), 150):
            rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "status": "eq.vendu", "id": f"in.({','.join(ids[i:i + 150])})"}), (200,)).json()
            for c in rows:
                if c.get("vinted_url") or c.get("ebay_offer_id"):
                    out.append({**_slim(c), "price": c.get("price"), "vinted_url": c.get("vinted_url"), "ebay_url": c.get("ebay_url"), "ebay_listed": bool(c.get("ebay_offer_id")), "sold_at": sold_at[c["id"]]})
    return sorted(out, key=lambda c: c["sold_at"] or "", reverse=True)


class Delisted(BaseModel):
    market: str  # vinted | ebay


@router.post("/salon/delist/{card_id}")
async def mark_delisted(card_id: str, body: Delisted, user: dict = Depends(require_admin)):
    """Vinted : le vendeur confirme avoir retiré l'annonce. eBay : nouvel essai de retrait."""
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "id": f"eq.{card_id}"}), (200,)).json()
        if not rows:
            raise HTTPException(status_code=404, detail="Carte introuvable")
        if body.market == "vinted":
            _check(await client.patch(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "id": f"eq.{card_id}"}, json={"vinted_url": None}))
            return {"ok": True}
    if body.market == "ebay":
        res = await _withdraw_ebay(user_id, rows)
        if res["failed"]:
            raise HTTPException(status_code=502, detail="Retrait eBay impossible : vérifie la connexion eBay dans l'app")
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Marketplace inconnue")


@router.post("/salon/carts/{cart_id}/cancel")
async def cancel_cart(cart_id: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] == "paid":
            raise HTTPException(status_code=409, detail="Panier déjà encaissé")
        return await _set_cart(client, cart_id, user["sub"], {"status": "cancelled"})


@router.post("/salon/carts/{cart_id}/extend")
async def extend_cart(cart_id: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        return await _set_cart(client, cart_id, user["sub"], {"expires_at": _iso(_now() + timedelta(minutes=HOLD_MINUTES))})


# ── Bilan de la journée ──────────────────────────────────────────────────────

def _distinct(events: list[dict], kind: str) -> set:
    return {e["visitor"] for e in events if e["kind"] == kind}


def top_searches(events: list[dict], kind: str, limit: int = 10) -> list[dict]:
    """Recherches les plus fréquentes (en visiteurs distincts). Les débuts de
    frappe (« wem » avant « wemby ») d'un même visiteur ne comptent pas."""
    by_visitor: dict = {}
    for e in events:
        if e["kind"] == kind and e.get("query"):
            by_visitor.setdefault(e["visitor"], set()).add(e["query"])
    counts: dict = {}
    for queries in by_visitor.values():
        for q in queries:
            if not any(o != q and o.startswith(q) for o in queries):
                counts[q] = counts.get(q, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"query": q, "count": n} for q, n in ranked[:limit]]


def build_stats(carts: list[dict], events: Optional[list[dict]], cards: dict) -> dict:
    """Bilan d'une période : ventes (paniers) + entonnoir (événements anonymes).
    `events` vaut None si la table n'existe pas encore."""
    now = _iso(_now())
    status = {"paid": 0, "cancelled": 0, "expired": 0, "active": 0}
    for c in carts:
        st = "expired" if c["status"] == "active" and c["expires_at"] <= now else c["status"]
        status[st] = status.get(st, 0) + 1
    paid = [c for c in carts if c["status"] == "paid"]
    revenue = _money(sum(float(c["total"]) for c in paid))
    asked_paid = _money(sum(offer_summary(c.get("lines") or [])["asked"] for c in paid if c.get("lines")))
    with_offer = [offer_summary(c.get("lines") or []) for c in carts]
    with_offer = [o for o in with_offer if o["offer"] is not None]
    sold_ids = [cid for c in paid for cid in c["card_ids"]]

    out = {
        "sales": {
            "carts": len(carts),
            "status": status,
            "revenue": revenue,
            "cards_sold": len(sold_ids),
            "avg_cart": _money(revenue / len(paid)) if paid else 0,
            "discount": _money(max(asked_paid - sum(float(c["total"]) for c in paid if c.get("lines")), 0)),
            "offers": len(with_offer),
            "offers_accepted": sum(1 for o in with_offer if o["offer_state"] == "accepted"),
            "offers_refused": sum(1 for o in with_offer if o["offer_state"] == "refused"),
            "offers_countered": sum(1 for o in with_offer if o["offer_state"] == "countered"),
        },
        "paid_at": sorted(c["paid_at"] for c in paid if c.get("paid_at")),
        "tracking": events is not None,
    }
    if events is None:
        return out

    paid_ids = {c["id"] for c in paid}
    first_visit: dict = {}
    for e in events:
        v = e["visitor"]
        if v not in first_visit or e["created_at"] < first_visit[v]:
            first_visit[v] = e["created_at"]
    out["funnel"] = {
        "visitors": len(first_visit),
        "viewed": len(_distinct(events, "view")),
        "added": len(_distinct(events, "add")),
        "reserved": len(_distinct(events, "reserve")),
        "paid": len({e["visitor"] for e in events if e["kind"] == "reserve" and e.get("cart_id") in paid_ids}),
    }
    out["visits_at"] = sorted(first_visit.values())

    def top(kind: str) -> list[dict]:
        seen: dict = {}
        for e in events:
            if e["kind"] == kind and e.get("card_id"):
                seen.setdefault(e["card_id"], set()).add(e["visitor"])
        ranked = sorted(seen.items(), key=lambda kv: -len(kv[1]))
        return [{"card": cards[cid], "count": len(vs), "sold": cid in sold_ids} for cid, vs in ranked if cid in cards][:10]

    out["searches"] = top_searches(events, "search")
    out["searches_empty"] = top_searches(events, "search_empty")
    out["top_viewed"] = top("view")
    out["top_added"] = top("add")
    return out


@router.get("/salon/stats")
async def salon_stats(start: str, end: str, user: dict = Depends(require_admin)):
    """Bilan entre `start` et `end` (ISO UTC, la journée locale est calculée côté navigateur)."""
    try:
        start_dt, end_dt = datetime.fromisoformat(start.replace("Z", "+00:00")), datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates invalides")
    # Valeurs entre guillemets : PostgREST l'exige dans and=(…) pour « : » et « . ».
    span = f'(created_at.gte."{_iso(start_dt)}",created_at.lt."{_iso(end_dt)}")'
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        carts = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/salon_carts", {"user_id": f"eq.{user_id}", "and": span, "order": "created_at.asc"})
        try:
            events = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/salon_events", {"user_id": f"eq.{user_id}", "and": span, "order": "created_at.asc"})
        except HTTPException:
            events = None  # table absente : migration add_salon_events pas encore passée
        ids = sorted({e["card_id"] for e in (events or []) if e.get("card_id")})
        cards: dict = {}
        for i in range(0, len(ids), 150):
            chunk = ids[i:i + 150]
            rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "id": f"in.({','.join(chunk)})"}), (200,)).json()
            cards.update({c["id"]: _slim(c) for c in rows})
    return build_stats(carts, events, cards)
