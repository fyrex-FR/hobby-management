import os
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import httpx

from .auth import current_user
from .cards import resolve_user_id, supabase_headers, SUPABASE_URL

router = APIRouter()


class FolderCreate(BaseModel):
    name: str
    emoji: Optional[str] = None
    position: Optional[int] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    position: Optional[int] = None


@router.get("/folders")
async def list_folders(user: dict = Depends(current_user), x_impersonate: Optional[str] = Header(default=None)):
    user_id = resolve_user_id(user, x_impersonate)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/folders",
            headers=supabase_headers(),
            params={"user_id": f"eq.{user_id}", "order": "position.asc,created_at.asc"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/folders", status_code=201)
async def create_folder(body: FolderCreate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = user_id

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/folders",
            headers=supabase_headers(),
            json=payload,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return data[0] if isinstance(data, list) else data


@router.patch("/folders/{folder_id}")
async def update_folder(folder_id: str, body: FolderUpdate, user: dict = Depends(current_user)):
    user_id = user["sub"]
    payload = body.model_dump(exclude_none=True)

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/folders",
            headers=supabase_headers(),
            params={"id": f"eq.{folder_id}", "user_id": f"eq.{user_id}"},
            json=payload,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    if isinstance(data, list):
        if not data:
            raise HTTPException(status_code=404, detail="Folder not found")
        return data[0]
    return data


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/rest/v1/folders",
            headers=supabase_headers(),
            params={"id": f"eq.{folder_id}", "user_id": f"eq.{user_id}"},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
