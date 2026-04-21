import os
import httpx

DAILY_LIMIT = 480  # leave 20 buffer under Gemini free tier 500 RPD

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


async def get_usage() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/get_daily_ai_usage",
            headers=_headers(),
            json={"p_limit": DAILY_LIMIT},
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Quota lookup failed: {resp.text}")

    return resp.json()


async def increment() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/increment_daily_ai_usage",
            headers=_headers(),
            json={"p_limit": DAILY_LIMIT},
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Quota increment failed: {resp.text}")

    return resp.json()


async def check_quota() -> bool:
    usage = await get_usage()
    return usage["used"] < DAILY_LIMIT
