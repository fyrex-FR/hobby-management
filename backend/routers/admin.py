import os
import httpx
from fastapi import APIRouter, Depends, HTTPException

from .auth import current_user

router = APIRouter()

ADMIN_EMAIL = "xavier.andrieux@gmail.com"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _service_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }


def require_admin(user: dict = Depends(current_user)) -> dict:
    email = user.get("email") or ""
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/admin/users")
async def list_users(_: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=_service_headers(),
            params={"per_page": 100},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    users = data.get("users", data) if isinstance(data, dict) else data
    return [
        {"id": u["id"], "email": u.get("email", ""), "created_at": u.get("created_at", "")}
        for u in users
    ]
