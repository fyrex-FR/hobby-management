import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from .auth import current_user
from .cards import supabase_headers
from .upload import _get_s3, R2_BUCKET_NAME, R2_PUBLIC_URL
from services.card_taxonomy import apply_refine, card_fields, classify, refine_keywords, strip_grading
from services.ebay_service import search_ebay_listings, search_ebay_sold
from services.extension_helpers import (
    allowed_image_url, allowed_source_url, annotate_comparables, build_browse_queries,
    build_search_queries, exclude_source_listing, merge_ranked_results, summarize_results,
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


SOLD_LIMIT = 60
ACTIVE_LIMIT = 50
ENOUGH_COMPARABLES = 8


class ReferenceRefine(BaseModel):
    """Correction manuelle de la case de référence, depuis le panneau."""
    variant_text: Optional[str] = Field(default=None, max_length=60)
    grader: Optional[str] = Field(default=None, max_length=12)
    grade: Optional[float] = Field(default=None, ge=1, le=10)
    grade_label: Optional[str] = Field(default=None, max_length=20)


class AnalyzeRequest(BaseModel):
    source: Literal["vinted", "ebay"]
    source_url: str
    title: str = Field(min_length=2, max_length=500)
    displayed_price: Optional[float] = Field(default=None, ge=0)
    image_url: str
    query: Optional[str] = Field(default=None, max_length=300)
    condition: Optional[str] = Field(default=None, max_length=200)
    specifics: Optional[dict[str, str]] = None
    description: Optional[str] = Field(default=None, max_length=600)
    refine: Optional[ReferenceRefine] = None

    @field_validator("specifics")
    @classmethod
    def _bound_specifics(cls, value: Optional[dict]) -> Optional[dict]:
        """Les caractéristiques viennent du DOM : borner ce qui entre en base de règles."""
        if not value:
            return None
        return {str(k)[:80]: str(v)[:160] for k, v in list(value.items())[:40]}


async def _collect_sold(queries: list[str], title: str) -> tuple[list[dict], list[dict], list[str]]:
    """Ventes terminées : élargir la requête tant qu'on n'a pas de quoi comparer."""
    groups, searches, errors = [], [], []
    for query in queries:
        sold = await search_ebay_sold(query, max_results=SOLD_LIMIT)
        groups.append(sold.get("results", []))
        searches.append({"query": query, "count": len(sold.get("results", []))})
        if sold.get("error"):
            errors.append(sold["error"])
        if len(merge_ranked_results(groups, title)) >= ENOUGH_COMPARABLES:
            break
    return merge_ranked_results(groups, title), searches, errors


async def _collect_active(queries: list[str]) -> tuple[list[dict], list[dict], list[str]]:
    """Annonces actives : la Browse API combine les mots en ET, donc on raccourcit
    la requête jusqu'à ce qu'elle ramène quelque chose plutôt que de conclure
    à un marché vide."""
    searches, errors = [], []
    for query in queries:
        active = await search_ebay_listings(query, max_results=ACTIVE_LIMIT, marketplace_id="EBAY_FR")
        results = active.get("results", [])
        searches.append({"query": query, "count": len(results)})
        if active.get("error"):
            errors.append(active["error"])
            break
        if results:
            return results, searches, errors
    return [], searches, errors


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, user: dict = Depends(current_extension_user)):
    if not allowed_source_url(body.source, body.source_url):
        raise HTTPException(status_code=422, detail="URL d'annonce non autorisée")

    reference = classify(body.title, condition=body.condition or "",
                         specifics=body.specifics, description=body.description or "")
    refine = body.refine.model_dump() if body.refine else None
    extra = refine_keywords(refine) if refine else []
    if refine:
        reference = apply_refine(reference, refine)

    # On cherche la carte, pas le slab : la note sert à ranger les résultats
    # dans leur case, la garder dans la requête viderait toutes les autres.
    subject = strip_grading(body.title) or body.title
    manual = body.query.strip() if body.query and body.query.strip() else ""
    sold_queries = [manual] if manual else build_search_queries(subject, extra)
    active_queries = [manual] if manual else build_browse_queries(subject, extra)

    sold_results, sold_searches, errors = await _collect_sold(sold_queries, body.title)
    active_results, active_searches, active_errors = await _collect_active(active_queries)
    errors.extend(active_errors)

    sold_results = exclude_source_listing(sold_results, body.source_url)
    active_results = exclude_source_listing(merge_ranked_results([active_results], body.title), body.source_url)
    return {
        "query": sold_queries[0], "queries": sold_queries,
        "reference": reference,
        "prefill": card_fields(reference, body.specifics, title=body.title),
        "searches": {"sold": sold_searches, "active": active_searches},
        "sold": summarize_results(annotate_comparables(sold_results, reference)),
        "active": summarize_results(annotate_comparables(active_results, reference)),
        "warnings": list(dict.fromkeys(errors)),
    }


class ExtensionCardCreate(BaseModel):
    source: Literal["vinted", "ebay"]
    source_url: str
    image_url: str
    displayed_price: Optional[float] = Field(default=None, ge=0)
    sport: Literal["Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"] = "Autre"
    player: Optional[str] = Field(default=None, max_length=120)
    team: Optional[str] = Field(default=None, max_length=120)
    year: Optional[str] = Field(default=None, max_length=20)
    brand: Optional[str] = Field(default=None, max_length=80)
    set_name: Optional[str] = Field(default=None, max_length=120)
    card_number: Optional[str] = Field(default=None, max_length=20)
    parallel_name: Optional[str] = Field(default=None, max_length=80)
    numbered: Optional[str] = Field(default=None, max_length=20)
    is_rookie: Optional[bool] = None
    grading_company: Optional[str] = Field(default=None, max_length=20)
    grading_grade: Optional[str] = Field(default=None, max_length=10)


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
    # Un champ laissé vide dans le panneau reste vide dans CardVaults : mieux
    # vaut un trou visible qu'une chaîne vide à nettoyer plus tard.
    payload = {key: value for key, value in payload.items() if value != ""}
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
