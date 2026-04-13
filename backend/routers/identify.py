import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import current_user
from services.gemini import identify_gemini
from services.quota import check_quota, increment, get_usage

router = APIRouter()


class IdentifyRequest(BaseModel):
    front_base64: str
    back_base64: str


def _allowed_users() -> set[str]:
    raw = os.environ.get("AI_ALLOWED_USERS", "")
    return {uid.strip() for uid in raw.split(",") if uid.strip()}


@router.post("/identify")
async def identify_card(body: IdentifyRequest, user: dict = Depends(current_user)):
    allowed = _allowed_users()
    if allowed and user["sub"] not in allowed:
        raise HTTPException(status_code=403, detail="AI identification not authorized for this account")

    if not os.environ.get("GOOGLE_API_KEY", ""):
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")

    if not check_quota():
        usage = get_usage()
        raise HTTPException(
            status_code=429,
            detail=f"Quota journalier atteint ({usage['used']}/{usage['limit']} appels). Réessaie demain."
        )

    increment()
    out = await identify_gemini(body.front_base64, body.back_base64)

    if out["error"]:
        raise HTTPException(status_code=502, detail=f"Gemini error: {out['error']}")

    if not out["result"]:
        raise HTTPException(status_code=422, detail="Gemini returned no result")

    return out["result"]


@router.get("/identify/quota")
async def get_quota(user: dict = Depends(current_user)):
    return get_usage()
