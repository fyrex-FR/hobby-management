import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import httpx

from .auth import current_user

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



class CardCreate(BaseModel):
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
    is_rookie: Optional[bool] = None
    condition_notes: Optional[str] = None
    status: Optional[str] = "collection"
    price: Optional[float] = None
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
    is_rookie: Optional[bool] = None
    condition_notes: Optional[str] = None
    status: Optional[str] = None
    price: Optional[float] = None
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


@router.patch("/cards/{card_id}")
async def update_card(card_id: str, body: CardUpdate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_none=True)

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

    if "quantity" in payload:
        card = {**card, "ebay_quantity_sync": await _push_quantity_to_ebay(card, user_id)}
    return card


async def _push_quantity_to_ebay(card: dict, user_id: str) -> Optional[dict]:
    """Répercute le stock de la carte sur son annonce eBay en ligne (sens app ->
    eBay). Best-effort : une erreur eBay ne doit jamais faire échouer la mise à
    jour de la carte, qui est déjà enregistrée — on renvoie juste le résultat au
    frontend pour qu'il puisse le signaler.

    Renvoie None si la carte n'a pas d'annonce en ligne (cas courant)."""
    if not card.get("ebay_offer_id") or not card.get("ebay_url"):
        return None
    try:
        from services import ebay_selling
        from services.ebay_oauth import get_valid_access_token

        access_token = await get_valid_access_token(user_id)
        if not access_token:
            return {"ok": False, "error": "Compte eBay non connecté."}
        result = await ebay_selling.update_listing_quantity(
            card, access_token, int(card.get("quantity") or 0)
        )
        return {"ok": True, "quantity": result["quantity"]}
    except Exception as e:
        logger.exception("Sync stock -> eBay: échec pour la carte %s", card.get("id"))
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
