from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Optional
import httpx

from .auth import current_user
from .cards import supabase_headers, SUPABASE_URL

router = APIRouter()
URL = f"{SUPABASE_URL}/rest/v1/scan_history"
MAX_IMAGE = 400_000  # data URL JPEG ~800 px : largement sous cette borne


class ScanSave(BaseModel):
    id: str
    ident: dict[str, Any]
    estimate_value: Optional[float] = None
    estimate_status: Optional[str] = None
    thumb: Optional[str] = None
    front: Optional[str] = None
    back: Optional[str] = None
    card_id: Optional[str] = None


class ScanPatch(BaseModel):
    card_id: str


def _check(resp: httpx.Response, ok=(200, 201, 204)):
    if resp.status_code not in ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)


@router.get("/scans")
async def list_scans(limit: int = 300, user: dict = Depends(current_user)):
    # Liste légère : jamais front/back (chargés au détail).
    async with httpx.AsyncClient() as client:
        resp = await client.get(URL, headers=supabase_headers(), params={
            "user_id": f"eq.{user['sub']}",
            "select": "id,created_at,ident,estimate_value,estimate_status,thumb,card_id",
            "order": "created_at.desc",
            "limit": str(min(limit, 1000)),
        })
    _check(resp, (200,))
    return resp.json()


@router.get("/scans/{scan_id}")
async def get_scan(scan_id: str, user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(URL, headers=supabase_headers(), params={
            "id": f"eq.{scan_id}", "user_id": f"eq.{user['sub']}", "select": "front,back",
        })
    _check(resp, (200,))
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found")
    return rows[0]


@router.put("/scans")
async def save_scan(body: ScanSave, user: dict = Depends(current_user)):
    for img in (body.thumb, body.front, body.back):
        if img and len(img) > MAX_IMAGE:
            raise HTTPException(status_code=413, detail="Image trop lourde")
    payload = body.model_dump()
    payload["user_id"] = user["sub"]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            URL,
            headers={**supabase_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": "id"},
            json=payload,
        )
    _check(resp)
    return {"ok": True}


@router.patch("/scans/{scan_id}")
async def link_card(scan_id: str, body: ScanPatch, user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            URL, headers=supabase_headers(),
            params={"id": f"eq.{scan_id}", "user_id": f"eq.{user['sub']}"},
            json={"card_id": body.card_id},
        )
    _check(resp)
    return {"ok": True}


@router.delete("/scans/{scan_id}", status_code=204)
async def delete_scan(scan_id: str, user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.delete(URL, headers=supabase_headers(), params={
            "id": f"eq.{scan_id}", "user_id": f"eq.{user['sub']}",
        })
    _check(resp)
