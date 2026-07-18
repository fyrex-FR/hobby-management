import os
from datetime import datetime, timezone
from typing import Optional

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TTL_SECONDS = 24 * 3600  # fraîcheur du cache


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def is_fresh(fetched_at: str) -> bool:
    try:
        ts = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds() < TTL_SECONDS
    except Exception:
        return False


async def get_cached(card_id: str) -> Optional[dict]:
    """Retourne {"payload": ..., "fetched_at": ...} ou None."""
    if not _enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/ebay_sales_cache",
                headers=_headers(),
                params={"card_id": f"eq.{card_id}", "select": "payload,fetched_at"},
            )
        if resp.status_code != 200:
            return None
        rows = resp.json()
        return rows[0] if rows else None
    except Exception:
        return None


async def set_cached(card_id: str, payload: dict) -> None:
    if not _enabled():
        return
    body = {
        "card_id": card_id,
        "payload": payload,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{SUPABASE_URL}/rest/v1/ebay_sales_cache",
                headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
                json=body,
            )
    except Exception:
        pass
