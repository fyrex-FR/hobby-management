import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import httpx

from .auth import current_user
from .cards import fetch_all_rows, resolve_user_id

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


class ShareCreate(BaseModel):
    filter: str = "all"          # "all" | "collection" | "a_vendre"
    show_prices: bool = False
    title: Optional[str] = None


class ShareUpdate(BaseModel):
    filter: Optional[str] = None
    show_prices: Optional[bool] = None
    title: Optional[str] = None


@router.post("/share", status_code=201)
async def create_share(body: ShareCreate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    token = secrets.token_urlsafe(12)

    payload = {
        "user_id": user_id,
        "token": token,
        "filter": body.filter,
        "show_prices": body.show_prices,
        "title": body.title,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            json=payload,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return data[0] if isinstance(data, list) else data


@router.get("/share/my")
async def my_shares(user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            params={"user_id": f"eq.{user_id}", "order": "created_at.desc"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.patch("/share/{share_id}")
async def update_share(share_id: str, body: ShareUpdate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_none=True)
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            params={"id": f"eq.{share_id}", "user_id": f"eq.{user_id}"},
            json=payload,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return data[0] if isinstance(data, list) else data


@router.delete("/share/{share_id}", status_code=204)
async def delete_share(share_id: str, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            params={"id": f"eq.{share_id}", "user_id": f"eq.{user_id}"},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)


# ── Route publique — pas d'auth ──────────────────────────────────────────────

@router.get("/share/{token}/view")
async def view_share(token: str):
    async with httpx.AsyncClient() as client:
        # 1. Récupérer le share link
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            params={"token": f"eq.{token}", "limit": "1"},
        )
    if resp.status_code != 200 or not resp.json():
        raise HTTPException(status_code=404, detail="Lien introuvable ou expiré")

    share = resp.json()[0]
    user_id = share["user_id"]
    filter_val = share.get("filter", "all")
    show_prices = share.get("show_prices", False)

    # 2. Récupérer les cartes
    params: dict = {"user_id": f"eq.{user_id}", "order": "created_at.desc"}
    if filter_val == "collection":
        params["status"] = "eq.collection"
    elif filter_val == "a_vendre":
        params["status"] = "eq.a_vendre"
    else:
        # "all" = tout sauf drafts
        params["status"] = "neq.draft"

    async with httpx.AsyncClient() as client:
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", params)

    # 3. Masquer les prix si nécessaire
    if not show_prices:
        for card in cards:
            card.pop("price", None)
            card.pop("purchase_price", None)

    # Toujours masquer les infos sensibles
    for card in cards:
        card.pop("user_id", None)

    return {
        "title": share.get("title"),
        "filter": filter_val,
        "show_prices": show_prices,
        "card_count": len(cards),
        "cards": cards,
    }


# ── Demandes d'intérêt ────────────────────────────────────────────────────────

class InterestCreate(BaseModel):
    viewer_handle: str
    message: Optional[str] = None
    card_ids: list[str] = []


class RequestUpdate(BaseModel):
    status: str


@router.post("/share/{token}/interest", status_code=201)
async def create_interest(token: str, body: InterestCreate):
    # Route PUBLIQUE (pas d'auth) — validée par le token de partage.
    handle = (body.viewer_handle or "").strip()
    if not handle:
        raise HTTPException(status_code=400, detail="Pseudo requis")
    if len(handle) > 80:
        handle = handle[:80]
    message = (body.message or "").strip()[:1000]
    card_ids = [c for c in (body.card_ids or []) if c][:300]
    if not card_ids:
        raise HTTPException(status_code=400, detail="Aucune carte sélectionnée")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/share_links",
            headers=supabase_headers(),
            params={"token": f"eq.{token}", "limit": "1"},
        )
    if resp.status_code != 200 or not resp.json():
        raise HTTPException(status_code=404, detail="Lien introuvable ou expiré")
    user_id = resp.json()[0]["user_id"]

    payload = {
        "user_id": user_id,
        "share_token": token,
        "viewer_handle": handle,
        "message": message or None,
        "card_ids": card_ids,
        "status": "new",
    }
    async with httpx.AsyncClient() as client:
        ins = await client.post(
            f"{SUPABASE_URL}/rest/v1/share_requests",
            headers=supabase_headers(),
            json=payload,
        )
    if ins.status_code not in (200, 201):
        raise HTTPException(status_code=ins.status_code, detail=ins.text)
    return {"ok": True}


@router.get("/share/requests")
async def list_requests(user: dict = Depends(current_user), x_impersonate: Optional[str] = Header(default=None)):
    user_id = resolve_user_id(user, x_impersonate)
    async with httpx.AsyncClient() as client:
        return await fetch_all_rows(
            client,
            f"{SUPABASE_URL}/rest/v1/share_requests",
            {"user_id": f"eq.{user_id}", "order": "created_at.desc"},
        )


@router.patch("/share/requests/{request_id}")
async def update_request(request_id: str, body: RequestUpdate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/share_requests",
            headers=supabase_headers(),
            params={"id": f"eq.{request_id}", "user_id": f"eq.{user_id}"},
            json={"status": body.status},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return data[0] if isinstance(data, list) and data else {"ok": True}


@router.delete("/share/requests/{request_id}", status_code=204)
async def delete_request(request_id: str, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/rest/v1/share_requests",
            headers=supabase_headers(),
            params={"id": f"eq.{request_id}", "user_id": f"eq.{user_id}"},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

