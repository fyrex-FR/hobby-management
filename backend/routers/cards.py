import logging
import os
import base64
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Literal, Optional
import httpx

from .auth import current_user
from services.marketplace_pricing import calculate_ebay_price
from services.gemini import identify_gemini

logger = logging.getLogger("cards")

ADMIN_EMAIL = "xavier.andrieux@gmail.com"


def resolve_user_id(user: dict, x_impersonate: Optional[str] = None) -> str:
    email = user.get("email") or ""
    if x_impersonate and email == ADMIN_EMAIL:
        return x_impersonate
    return user["sub"]

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")


def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def fetch_all_rows(client: httpx.AsyncClient, url: str, params: dict, page: int = 1000) -> list:
    """Récupère toutes les lignes en paginant (PostgREST plafonne le nombre de lignes par requête)."""
    rows: list = []
    offset = 0
    while True:
        resp = await client.get(
            url,
            headers=supabase_headers(),
            params={**params, "limit": str(page), "offset": str(offset)},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def _is_allowed_card_image_url(url: str) -> bool:
    """Only fetch images from the configured public R2 host (SSRF guard)."""
    image = urlparse(url)
    public = urlparse(R2_PUBLIC_URL)
    return image.scheme == "https" and bool(public.hostname) and image.hostname == public.hostname


async def _download_card_image(client: httpx.AsyncClient, url: str) -> str:
    if not _is_allowed_card_image_url(url):
        raise HTTPException(status_code=422, detail="Image URL is not hosted on CardVaults storage")
    resp = await client.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Unable to load card image")
    if not resp.headers.get("content-type", "").startswith("image/"):
        raise HTTPException(status_code=422, detail="Card image has an invalid content type")
    return base64.b64encode(resp.content).decode("ascii")



class CardCreate(BaseModel):
    sport: Literal["Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"] = "Basket"
    player: Optional[str] = None
    team: Optional[str] = None
    year: Optional[str] = None
    brand: Optional[str] = None
    set_name: Optional[str] = None
    card_type: Optional[str] = None
    insert_name: Optional[str] = None
    parallel_name: Optional[str] = None
    parallel_confidence: Optional[int] = None
    card_number: Optional[str] = None
    numbered: Optional[str] = None
    serial_number: Optional[str] = None
    is_rookie: Optional[bool] = None
    condition_notes: Optional[str] = None
    status: Optional[str] = "collection"
    price: Optional[float] = None
    vinted_price: Optional[float] = None
    ebay_price: Optional[float] = None
    price_inflation: Optional[float] = 0
    purchase_price: Optional[float] = None
    sale_mode: Optional[str] = "unit"
    is_shelved: Optional[bool] = False
    is_listed: Optional[bool] = False
    listing_validated: Optional[bool] = False
    image_front_url: Optional[str] = None
    image_back_url: Optional[str] = None
    grading_company: Optional[str] = None
    grading_status: Optional[str] = None
    grading_submitted_at: Optional[str] = None
    grading_returned_at: Optional[str] = None
    grading_grade: Optional[str] = None
    grading_cert: Optional[str] = None
    grading_cost: Optional[float] = None
    vinted_url: Optional[str] = None
    ebay_url: Optional[str] = None
    quantity: Optional[int] = None
    folder_ids: Optional[list[str]] = None


class CardUpdate(BaseModel):
    sport: Optional[Literal["Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"]] = None
    player: Optional[str] = None
    team: Optional[str] = None
    year: Optional[str] = None
    brand: Optional[str] = None
    set_name: Optional[str] = None
    card_type: Optional[str] = None
    insert_name: Optional[str] = None
    parallel_name: Optional[str] = None
    parallel_confidence: Optional[int] = None
    card_number: Optional[str] = None
    numbered: Optional[str] = None
    serial_number: Optional[str] = None
    is_rookie: Optional[bool] = None
    condition_notes: Optional[str] = None
    status: Optional[str] = None
    price: Optional[float] = None
    vinted_price: Optional[float] = None
    ebay_price: Optional[float] = None
    price_inflation: Optional[float] = None
    purchase_price: Optional[float] = None
    sale_mode: Optional[str] = None
    is_shelved: Optional[bool] = None
    is_listed: Optional[bool] = None
    listing_validated: Optional[bool] = None
    image_front_url: Optional[str] = None
    image_back_url: Optional[str] = None
    grading_company: Optional[str] = None
    grading_status: Optional[str] = None
    grading_submitted_at: Optional[str] = None
    grading_returned_at: Optional[str] = None
    grading_grade: Optional[str] = None
    grading_cert: Optional[str] = None
    grading_cost: Optional[float] = None
    vinted_url: Optional[str] = None
    ebay_url: Optional[str] = None
    quantity: Optional[int] = None
    folder_ids: Optional[list[str]] = None


class EbayPriceRecalculation(BaseModel):
    card_ids: list[str]
    only_missing: bool = True


@router.get("/cards")
async def list_cards(user: dict = Depends(current_user), x_impersonate: Optional[str] = Header(default=None)):
    user_id = resolve_user_id(user, x_impersonate)
    async with httpx.AsyncClient() as client:
        return await fetch_all_rows(
            client,
            f"{SUPABASE_URL}/rest/v1/cards",
            {"user_id": f"eq.{user_id}", "order": "created_at.desc"},
        )


@router.post("/cards", status_code=201)
async def create_card(body: CardCreate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_none=True)
    if "vinted_price" in payload:
        payload["price"] = payload["vinted_price"]
    elif "price" in payload:
        payload["vinted_price"] = payload["price"]
    payload["user_id"] = user_id

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=supabase_headers(),
            json=payload,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return data[0] if isinstance(data, list) else data


@router.post("/cards/{card_id}/reanalyze")
async def reanalyze_card(card_id: str, user: dict = Depends(current_user)):
    """Re-analyze stored photos server-side so browser CORS never blocks R2 images."""
    user_id = user["sub"]
    async with httpx.AsyncClient(timeout=65, follow_redirects=False) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=supabase_headers(),
            params={
                "id": f"eq.{card_id}",
                "user_id": f"eq.{user_id}",
                "select": "image_front_url,image_back_url",
                "limit": "1",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        rows = resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Card not found")
        card = rows[0]
        if not card.get("image_front_url"):
            raise HTTPException(status_code=422, detail="Front image is required")
        front_base64 = await _download_card_image(client, card["image_front_url"])
        back_base64 = None
        if card.get("image_back_url"):
            back_base64 = await _download_card_image(client, card["image_back_url"])

    out = await identify_gemini(front_base64, back_base64)
    if out["error"]:
        raise HTTPException(status_code=502, detail=f"Gemini error: {out['error']}")
    if not out["result"]:
        raise HTTPException(status_code=422, detail="Gemini returned no result")
    result = out["result"]
    if result.get("sport") not in {"Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"}:
        result["sport"] = "Basket"
    return result


@router.patch("/cards/{card_id}")
async def update_card(card_id: str, body: CardUpdate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_unset=True)
    if "vinted_price" in payload:
        payload["price"] = payload["vinted_price"]
    elif "price" in payload:
        payload["vinted_price"] = payload["price"]

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=supabase_headers(),
            params={"id": f"eq.{card_id}", "user_id": f"eq.{user_id}"},
            json=payload,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    if isinstance(data, list):
        if not data:
            raise HTTPException(status_code=404, detail="Card not found")
        card = data[0]
    else:
        card = data

    if "quantity" in payload or "price" in payload or "ebay_price" in payload:
        card = {**card, "ebay_quantity_sync": await _push_listing_state_to_ebay(card, user_id)}
    return card


@router.post("/cards/recalculate-ebay-prices")
async def recalculate_ebay_prices(
    body: EbayPriceRecalculation,
    user: dict = Depends(current_user),
    x_impersonate: Optional[str] = Header(default=None),
):
    user_id = resolve_user_id(user, x_impersonate)
    selected_ids = set(body.card_ids)
    if not selected_ids:
        return {"updated": 0, "skipped": 0}

    async with httpx.AsyncClient(timeout=60) as client:
        rows = await fetch_all_rows(
            client,
            f"{SUPABASE_URL}/rest/v1/cards",
            {"user_id": f"eq.{user_id}", "select": "id,user_id,vinted_price,ebay_price"},
        )
        selected = [row for row in rows if row["id"] in selected_ids]
        updates = [
            {
                "id": row["id"],
                "user_id": row["user_id"],
                "ebay_price": calculate_ebay_price(float(row["vinted_price"])),
            }
            for row in selected
            if row.get("vinted_price") is not None
            and (not body.only_missing or row.get("ebay_price") is None)
        ]
        for start in range(0, len(updates), 500):
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/cards",
                headers={
                    **supabase_headers(),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                params={"on_conflict": "id"},
                json=updates[start:start + 500],
            )
            if resp.status_code not in (200, 201, 204):
                raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return {"updated": len(updates), "skipped": len(selected) - len(updates)}


async def _push_listing_state_to_ebay(card: dict, user_id: str) -> Optional[dict]:
    """Répercute le stock ET le prix de la carte sur son annonce eBay en ligne
    (sens app -> eBay). Best-effort : une erreur eBay ne doit jamais faire
    échouer la mise à jour de la carte, qui est déjà enregistrée — on renvoie
    juste le résultat au frontend pour qu'il puisse le signaler.

    Renvoie None si la carte n'a pas d'annonce en ligne (cas courant)."""
    if not card.get("ebay_offer_id") or not card.get("ebay_url"):
        return None
    try:
        from services import ebay_selling
        from services.ebay_oauth import get_valid_access_token

        access_token = await get_valid_access_token(user_id)
        if not access_token:
            return {"ok": False, "error": "Compte eBay non connecté."}
        price = card.get("ebay_price") or card.get("price")
        result = await ebay_selling.update_listing_quantity(
            card,
            access_token,
            int(card.get("quantity") or 0),
            float(price) if price else None,
        )
        return {"ok": True, "quantity": result["quantity"], "unchanged": result.get("unchanged", False)}
    except Exception as e:
        logger.exception("Sync annonce -> eBay: échec pour la carte %s", card.get("id"))
        return {"ok": False, "error": str(e)[:300]}


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(card_id: str, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=supabase_headers(),
            params={"id": f"eq.{card_id}", "user_id": f"eq.{user_id}"},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
