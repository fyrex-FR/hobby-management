import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import current_user
from services.gemini import identify_gemini

router = APIRouter()
SPORTS = {"Basket", "Foot", "Baseball", "Football US", "Hockey", "Autre"}


class IdentifyRequest(BaseModel):
    front_base64: str
    back_base64: str | None = None


@router.post("/identify")
async def identify_card(body: IdentifyRequest, user: dict = Depends(current_user)):
    if not os.environ.get("GOOGLE_API_KEY", ""):
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")

    out = await identify_gemini(body.front_base64, body.back_base64)

    if out["error"]:
        raise HTTPException(status_code=502, detail=f"Gemini error: {out['error']}")

    if not out["result"]:
        raise HTTPException(status_code=422, detail="Gemini returned no result")

    result = out["result"]
    if result.get("sport") not in SPORTS:
        result["sport"] = "Basket"
    return result


@router.get("/identify/quota")
async def get_quota(user: dict = Depends(current_user)):
    return {
        "date": None,
        "used": 0,
        "limit": None,
        "remaining": None,
        "pct": 0,
        "disabled": True,
    }
