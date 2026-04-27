import os
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import httpx

from .auth import current_user

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


@router.get("/cards")
async def list_cards(user: dict = Depends(current_user), x_impersonate: Optional[str] = Header(default=None)):
    import logging
    logging.info(f"[cards] user={user.get('email')} x_impersonate={x_impersonate}")
    user_id = resolve_user_id(user, x_impersonate)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=supabase_headers(),
            params={"user_id": f"eq.{user_id}", "order": "created_at.desc"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


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
        return data[0]
    return data


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
