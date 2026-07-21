import os
from datetime import datetime, timezone
from typing import Optional

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_TABLE = f"{SUPABASE_URL}/rest/v1/ebay_seller_tokens"


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


async def get_row(user_id: str) -> Optional[dict]:
    """Ligne brute (tokens encore chiffrés) ou None si non connecté."""
    if not enabled():
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _TABLE,
            headers=_headers(),
            params={"user_id": f"eq.{user_id}", "select": "*"},
        )
    if resp.status_code != 200:
        return None
    rows = resp.json()
    return rows[0] if rows else None


async def upsert_row(user_id: str, fields: dict) -> None:
    """Insère ou met à jour la ligne de l'utilisateur (tokens déjà chiffrés)."""
    if not enabled():
        return
    body = {
        "user_id": user_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _TABLE,
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            json=body,
        )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase upsert ebay_seller_tokens {resp.status_code}: {resp.text[:300]}")


async def delete_row(user_id: str) -> None:
    if not enabled():
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.delete(
            _TABLE,
            headers=_headers(),
            params={"user_id": f"eq.{user_id}"},
        )
