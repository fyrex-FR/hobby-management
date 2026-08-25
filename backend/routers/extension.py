import asyncio
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .auth import current_user
from .cards import supabase_headers
from .upload import _get_s3, R2_BUCKET_NAME, R2_PUBLIC_URL
from services.ebay_service import search_ebay_listings, search_ebay_sold
from services.extension_helpers import (
    allowed_image_url, allowed_source_url, build_search_queries, merge_ranked_results, summarize_results,
)

router = APIRouter(prefix="/extension", tags=["extension"])

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
PAIRING_TTL_MINUTES = int(os.environ.get("EXTENSION_PAIRING_TTL_MINUTES", "10"))
TOKEN_TTL_DAYS = int(os.environ.get("EXTENSION_TOKEN_TTL_DAYS", "90"))
SPORTS = {"Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"}


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


async def _rest(method: str, table: str, *, params=None, json=None, prefer=None):
    headers = supabase_headers()
    if prefer:
        headers["Prefer"] = prefer
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(
            method,
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=headers,
            params=params,
            json=json,
        )
    if resp.status_code not in (200, 201, 204):
        raise HTTPException(status_code=502, detail="Extension storage unavailable")
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


async def current_extension_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="extension_token_required")
    token_hash = _hash(authorization[7:])
    rows = await _rest("GET", "extension_tokens", params={
        "token_hash": f"eq.{token_hash}",
        "revoked_at": "is.null",
        "expires_at": f"gt.{_iso(_now())}",
        "select": "id,user_id",
        "limit": "1",
    })
    if not rows:
        raise HTTPException(status_code=401, detail="extension_token_invalid")
    row = rows[0]
    await _rest("PATCH", "extension_tokens", params={"id": f"eq.{row['id']}"}, json={"last_used_at": _iso(_now())})
    return {"sub": row["user_id"], "token_id": row["id"]}


class PairingCreate(BaseModel):
    label: str = Field(default="Chrome", max_length=60)


class PairingApprove(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class PairingExchange(BaseModel):
    pairing_id: str
    exchange_secret: str


@router.post("/pairings", status_code=201)
async def create_pairing(body: PairingCreate):
    pairing_id = str(uuid.uuid4())
    exchange_secret = secrets.token_urlsafe(32)
    code = _code()
    expires_at = _now() + timedelta(minutes=PAIRING_TTL_MINUTES)
    await _rest("POST", "extension_pairings", json={
        "id": pairing_id,
        "code": code,
        "exchange_secret_hash": _hash(exchange_secret),
        "label": body.label,
        "status": "pending",
        "expires_at": _iso(expires_at),
    }, prefer="return=minimal")
    return {
        "pairing_id": pairing_id,
        "exchange_secret": exchange_secret,
        "code": code,
        "approve_url": f"https://collection.cardvaults.app/extension/pair?code={code}",
        "expires_at": _iso(expires_at),
    }


@router.post("/pairings/approve")
async def approve_pairing(body: PairingApprove, user: dict = Depends(current_user)):
    code = body.code.upper()
    rows = await _rest("GET", "extension_pairings", params={
        "code": f"eq.{code}", "status": "eq.pending", "select": "id,expires_at", "limit": "1"
    })
    if not rows or datetime.fromisoformat(rows[0]["expires_at"].replace("Z", "+00:00")) <= _now():
        raise HTTPException(status_code=404, detail="Code expiré ou inconnu")
    await _rest("PATCH", "extension_pairings", params={"id": f"eq.{rows[0]['id']}"}, json={
        "status": "approved", "user_id": user["sub"], "approved_at": _iso(_now())
    })
    return {"approved": True}


@router.post("/pairings/exchange")
async def exchange_pairing(body: PairingExchange):
    rows = await _rest("GET", "extension_pairings", params={
        "id": f"eq.{body.pairing_id}", "exchange_secret_hash": f"eq.{_hash(body.exchange_secret)}",
        "status": "eq.approved", "select": "id,user_id,label,expires_at", "limit": "1"
    })
    if not rows or datetime.fromisoformat(rows[0]["expires_at"].replace("Z", "+00:00")) <= _now():
        raise HTTPException(status_code=409, detail="Appairage en attente ou expiré")
    token = secrets.token_urlsafe(48)
    expires_at = _now() + timedelta(days=TOKEN_TTL_DAYS)
    await _rest("POST", "extension_tokens", json={
        "user_id": rows[0]["user_id"], "token_hash": _hash(token), "pairing_id": rows[0]["id"],
        "label": rows[0]["label"], "expires_at": _iso(expires_at)
    }, prefer="return=minimal")
    await _rest("PATCH", "extension_pairings", params={"id": f"eq.{rows[0]['id']}"}, json={"status": "exchanged"})
    return {"token": token, "expires_at": _iso(expires_at)}


@router.get("/tokens")
async def list_tokens(user: dict = Depends(current_user)):
    return await _rest("GET", "extension_tokens", params={
        "user_id": f"eq.{user['sub']}", "select": "id,label,created_at,last_used_at,expires_at,revoked_at", "order": "created_at.desc"
    })


@router.delete("/tokens/{token_id}", status_code=204)
async def revoke_token(token_id: str, user: dict = Depends(current_user)):
    await _rest("PATCH", "extension_tokens", params={"id": f"eq.{token_id}", "user_id": f"eq.{user['sub']}"}, json={"revoked_at": _iso(_now())})


async def _download_image(url: str) -> tuple[bytes, str]:
    if not allowed_image_url(url):
        raise HTTPException(status_code=422, detail="Hôte image non autorisé")
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        async with client.stream("GET", url, headers={"User-Agent": "CardVaults-Scout/1.0"}) as resp:
            if resp.status_code != 200:
                raise HTTPException(status_code=422, detail="Image inaccessible")
            content_type = resp.headers.get("content-type", "").split(";", 1)[0]
            if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                raise HTTPException(status_code=422, detail="Format image non autorisé")
            chunks = []
            size = 0
            async for chunk in resp.aiter_bytes():
                size += len(chunk)
                if size > 5_000_000:
                    raise HTTPException(status_code=413, detail="Image trop volumineuse")
                chunks.append(chunk)
    return b"".join(chunks), content_type


class AnalyzeRequest(BaseModel):
    source: Literal["vinted", "ebay"]
    source_url: str
    title: str = Field(min_length=2, max_length=500)
    displayed_price: Optional[float] = Field(default=None, ge=0)
    image_url: str
    query: Optional[str] = Field(default=None, max_length=300)


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, user: dict = Depends(current_extension_user)):
    if not allowed_source_url(body.source, body.source_url):
        raise HTTPException(status_code=422, detail="URL d'annonce non autorisée")
    queries = [body.query.strip()] if body.query and body.query.strip() else build_search_queries(body.title)
    sold_groups, active_groups, used_queries = [], [], []
    errors = []
    for query in queries:
        sold, active = await asyncio.gather(search_ebay_sold(query), search_ebay_listings(query))
        sold_groups.append(sold.get("results", []))
        active_groups.append(active.get("results", []))
        used_queries.append(query)
        errors.extend(error for error in (sold.get("error"), active.get("error")) if error)
        if len(merge_ranked_results(sold_groups, body.title)) >= 5 and len(merge_ranked_results(active_groups, body.title)) >= 5:
            break
    sold_results = merge_ranked_results(sold_groups, body.title)
    active_results = merge_ranked_results(active_groups, body.title)
    return {
        "query": used_queries[0], "queries": used_queries,
        "sold": summarize_results(sold_results), "active": summarize_results(active_results),
        "warnings": list(dict.fromkeys(errors)),
    }


class ExtensionCardCreate(BaseModel):
    source: Literal["vinted", "ebay"]
    source_url: str
    image_url: str
    displayed_price: Optional[float] = Field(default=None, ge=0)
    sport: Literal["Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"] = "Autre"
    player: Optional[str] = None
    team: Optional[str] = None
    year: Optional[str] = None
    brand: Optional[str] = None
    set_name: Optional[str] = None
    card_number: Optional[str] = None
    parallel_name: Optional[str] = None


@router.post("/cards", status_code=201)
async def create_extension_card(body: ExtensionCardCreate, user: dict = Depends(current_extension_user)):
    if not allowed_source_url(body.source, body.source_url):
        raise HTTPException(status_code=422, detail="URL d'annonce non autorisée")
    url_field = "vinted_url" if body.source == "vinted" else "ebay_url"
    existing = await _rest("GET", "cards", params={
        "user_id": f"eq.{user['sub']}", url_field: f"eq.{body.source_url}", "select": "*", "limit": "1"
    })
    if existing:
        return {"card": existing[0], "created": False}
    image, content_type = await _download_image(body.image_url)
    payload = body.model_dump(exclude={"source", "source_url", "image_url", "displayed_price"}, exclude_none=True)
    payload.update({
        "user_id": user["sub"], "status": "collection", "quantity": 1,
        "purchase_price": body.displayed_price, url_field: body.source_url,
    })
    rows = await _rest("POST", "cards", json=payload, prefer="return=representation")
    card = rows[0]
    path = f"{user['sub']}/{card['id']}_front.jpg"
    try:
        _get_s3().put_object(Bucket=R2_BUCKET_NAME, Key=path, Body=image, ContentType=content_type)
        image_url = f"{R2_PUBLIC_URL}/{path}"
        updated = await _rest("PATCH", "cards", params={"id": f"eq.{card['id']}", "user_id": f"eq.{user['sub']}"}, json={"image_front_url": image_url})
        card = updated[0] if updated else {**card, "image_front_url": image_url}
    except Exception:
        await _rest("DELETE", "cards", params={"id": f"eq.{card['id']}", "user_id": f"eq.{user['sub']}"})
        raise HTTPException(status_code=502, detail="Copie de l'image impossible")
    return {"card": card, "created": True}
