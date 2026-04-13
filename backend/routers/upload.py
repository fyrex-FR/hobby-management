import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from .auth import current_user

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "card-images"


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    card_id: str = Form(...),
    side: str = Form(...),
    user: dict = Depends(current_user),
):
    user_id = user["sub"]
    path = f"{user_id}/{card_id}_{side}.jpg"
    content = await file.read()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "image/jpeg",
                "x-upsert": "true",
            },
            content=content,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    return {"url": public_url}
