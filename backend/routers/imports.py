import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import current_user
from .cards import SUPABASE_URL, fetch_all_rows, supabase_headers
from .upload import R2_BUCKET_NAME, R2_PUBLIC_URL, _get_s3
from services.card_matching import classify_matches
from services.gemini import identify_gemini

router = APIRouter()


class BatchCreate(BaseModel):
    name: str = "Import de cartes"


class AnalyzeItem(BaseModel):
    front_base64: str
    back_base64: str | None = None
    front_filename: str | None = None
    back_filename: str | None = None
    position: int = 0


class ItemAction(BaseModel):
    action: Literal["shelve", "create", "increment", "ignore", "review"]
    target_card_id: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _one(client: httpx.AsyncClient, table: str, params: dict) -> dict:
    response = await client.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=supabase_headers(), params={**params, "limit": "1"})
    if response.status_code != 200:
        raise HTTPException(response.status_code, response.text)
    rows = response.json()
    if not rows:
        raise HTTPException(404, "Ressource introuvable")
    return rows[0]


async def _insert(client: httpx.AsyncClient, table: str, payload: dict) -> dict:
    response = await client.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=supabase_headers(), json=payload)
    if response.status_code not in (200, 201):
        raise HTTPException(response.status_code, response.text)
    data = response.json()
    return data[0] if isinstance(data, list) else data


async def _patch(client: httpx.AsyncClient, table: str, params: dict, payload: dict) -> dict:
    response = await client.patch(f"{SUPABASE_URL}/rest/v1/{table}", headers=supabase_headers(), params=params, json=payload)
    if response.status_code not in (200, 204):
        raise HTTPException(response.status_code, response.text)
    data = response.json()
    if not data:
        raise HTTPException(404, "Ressource introuvable")
    return data[0] if isinstance(data, list) else data


def _decode_image(raw: str) -> bytes:
    try:
        content = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise HTTPException(422, "Image base64 invalide") from exc
    if not content or len(content) > 12 * 1024 * 1024:
        raise HTTPException(413, "Image vide ou supérieure à 12 Mo")
    return content


def _upload_import_image(user_id: str, batch_id: str, item_id: str, side: str, raw: str) -> str:
    path = f"{user_id}/imports/{batch_id}/{item_id}_{side}.jpg"
    _get_s3().put_object(Bucket=R2_BUCKET_NAME, Key=path, Body=_decode_image(raw), ContentType="image/jpeg")
    return f"{R2_PUBLIC_URL}/{path}"


@router.post("/imports", status_code=201)
async def create_batch(body: BatchCreate, user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        return await _insert(client, "import_batches", {"user_id": user["sub"], "name": body.name.strip() or "Import de cartes"})


@router.get("/imports")
async def list_batches(user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        return await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/import_batches", {
            "user_id": f"eq.{user['sub']}", "order": "created_at.desc",
        })


@router.get("/imports/{batch_id}")
async def get_batch(batch_id: str, user: dict = Depends(current_user)):
    async with httpx.AsyncClient() as client:
        batch = await _one(client, "import_batches", {"id": f"eq.{batch_id}", "user_id": f"eq.{user['sub']}"})
        items = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/import_items", {
            "batch_id": f"eq.{batch_id}", "user_id": f"eq.{user['sub']}", "order": "position.asc,created_at.asc",
        })
    return {**batch, "items": items}


@router.post("/imports/{batch_id}/items/analyze", status_code=201)
async def analyze_item(batch_id: str, body: AnalyzeItem, user: dict = Depends(current_user)):
    user_id = user["sub"]
    item_id = str(uuid.uuid4())
    async with httpx.AsyncClient(timeout=75) as client:
        await _one(client, "import_batches", {"id": f"eq.{batch_id}", "user_id": f"eq.{user_id}", "status": "eq.open"})
        try:
            front_url = _upload_import_image(user_id, batch_id, item_id, "front", body.front_base64)
            back_url = _upload_import_image(user_id, batch_id, item_id, "back", body.back_base64) if body.back_base64 else None
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, f"Stockage image impossible: {str(exc)[:180]}") from exc

        item = await _insert(client, "import_items", {
            "id": item_id, "batch_id": batch_id, "user_id": user_id, "position": body.position,
            "front_image_url": front_url, "back_image_url": back_url,
            "front_filename": body.front_filename, "back_filename": body.back_filename,
        })
        result = await identify_gemini(body.front_base64, body.back_base64)
        if result["error"] or not result["result"]:
            return await _patch(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"}, {
                "classification": "error", "error": (result["error"] or "Identification vide")[:500], "updated_at": _now(),
            })

        identification = result["result"]
        identification["set_name"] = identification.get("set", "")
        identification["insert_name"] = identification.get("insert", "")
        identification["parallel_name"] = identification.get("parallel", "")
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", {
            "user_id": f"eq.{user_id}",
            "select": "id,player,year,brand,set_name,card_number,insert_name,parallel_name,numbered,serial_number",
        })
        matching = classify_matches(identification, cards, has_back=bool(body.back_base64))
        item = await _patch(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"}, {
            "identification": identification, "fingerprint": matching["fingerprint"],
            "classification": matching["classification"], "matches": matching["matches"], "error": None, "updated_at": _now(),
        })
        await _patch(client, "import_batches", {"id": f"eq.{batch_id}", "user_id": f"eq.{user_id}"}, {"updated_at": _now()})
        return item


@router.post("/imports/items/{item_id}/action")
async def apply_action(item_id: str, body: ItemAction, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient(timeout=30) as client:
        item = await _one(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"})
        if item.get("action_at"):
            if item.get("action") == body.action and item.get("target_card_id") == body.target_card_id:
                return item
            raise HTTPException(409, "Cet item a déjà été traité")

        created_card_id = None
        if body.action == "create":
            identification = item.get("identification") or {}
            card = await _insert(client, "cards", {
                "user_id": user_id, "sport": identification.get("sport") or "Basket",
                "player": identification.get("player") or None, "team": identification.get("team") or None,
                "year": identification.get("year") or None, "brand": identification.get("brand") or None,
                "set_name": identification.get("set_name") or identification.get("set") or None,
                "insert_name": identification.get("insert_name") or identification.get("insert") or None,
                "parallel_name": identification.get("parallel_name") or identification.get("parallel") or None,
                "parallel_confidence": identification.get("parallel_confidence"),
                "card_number": identification.get("card_number") or None, "numbered": identification.get("numbered") or None,
                "serial_number": identification.get("serial_number") or None, "is_rookie": identification.get("is_rookie"),
                "condition_notes": identification.get("condition_notes") or None, "card_type": identification.get("card_type") or None,
                "status": "collection", "quantity": 1, "image_front_url": item["front_image_url"], "image_back_url": item.get("back_image_url"),
            })
            created_card_id = card["id"]
        elif body.action == "increment":
            if not body.target_card_id:
                raise HTTPException(422, "Une carte cible est requise")
            target = await _one(client, "cards", {"id": f"eq.{body.target_card_id}", "user_id": f"eq.{user_id}"})
            response = await client.post(f"{SUPABASE_URL}/rest/v1/rpc/increment_card_quantity", headers=supabase_headers(), json={
                "p_card_id": target["id"], "p_user_id": user_id,
            })
            if response.status_code not in (200, 204):
                raise HTTPException(response.status_code, response.text)
        elif body.target_card_id:
            await _one(client, "cards", {"id": f"eq.{body.target_card_id}", "user_id": f"eq.{user_id}"})

        updated = await _patch(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"}, {
            "action": body.action, "target_card_id": body.target_card_id, "created_card_id": created_card_id,
            "action_at": _now(), "updated_at": _now(),
        })
        pending = await client.get(f"{SUPABASE_URL}/rest/v1/import_items", headers={**supabase_headers(), "Prefer": "count=exact"}, params={
            "batch_id": f"eq.{item['batch_id']}", "user_id": f"eq.{user_id}", "action_at": "is.null", "select": "id", "limit": "1",
        })
        if pending.status_code == 200 and not pending.json():
            await _patch(client, "import_batches", {"id": f"eq.{item['batch_id']}", "user_id": f"eq.{user_id}"}, {
                "status": "completed", "updated_at": _now(),
            })
        return updated


@router.post("/imports/items/{item_id}/retry")
async def retry_item(item_id: str, user: dict = Depends(current_user)):
    user_id = user["sub"]
    async with httpx.AsyncClient(timeout=75) as client:
        item = await _one(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}", "action_at": "is.null"})
        front_response = await client.get(item["front_image_url"])
        back_response = await client.get(item["back_image_url"]) if item.get("back_image_url") else None
        if front_response.status_code != 200 or (back_response and back_response.status_code != 200):
            raise HTTPException(502, "Impossible de relire les images conservées")
        front_base64 = base64.b64encode(front_response.content).decode()
        back_base64 = base64.b64encode(back_response.content).decode() if back_response else None
        result = await identify_gemini(front_base64, back_base64)
        if result["error"] or not result["result"]:
            return await _patch(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"}, {
                "classification": "error", "error": (result["error"] or "Identification vide")[:500], "updated_at": _now(),
            })
        identification = result["result"]
        identification["set_name"] = identification.get("set", "")
        identification["insert_name"] = identification.get("insert", "")
        identification["parallel_name"] = identification.get("parallel", "")
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", {
            "user_id": f"eq.{user_id}", "select": "id,player,year,brand,set_name,card_number,insert_name,parallel_name,numbered,serial_number",
        })
        matching = classify_matches(identification, cards, has_back=bool(back_base64))
        return await _patch(client, "import_items", {"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"}, {
            "identification": identification, "fingerprint": matching["fingerprint"],
            "classification": matching["classification"], "matches": matching["matches"], "error": None, "updated_at": _now(),
        })
