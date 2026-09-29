import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from .auth import current_user

router = APIRouter()

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "card-images")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _s3_client


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

    try:
        _get_s3().put_object(
            Bucket=R2_BUCKET_NAME,
            Key=path,
            Body=content,
            ContentType="image/jpeg",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    public_url = f"{R2_PUBLIC_URL}/{path}"
    return {"url": public_url}


# ── Fond personnalisé des photos vitrine (un par ton, propre à chaque compte) ──

VITRINE_TONES = ("dark", "light")
VITRINE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
VITRINE_MAX_BYTES = 8 * 1024 * 1024


def vitrine_backdrop_key(user_id: str, tone: str) -> str:
    """Clé R2 du fond vitrine d'un compte (une par ton, toujours dans son dossier)."""
    if tone not in VITRINE_TONES:
        raise HTTPException(status_code=400, detail="Ton invalide (dark ou light)")
    return f"{user_id}/vitrine/backdrop-{tone}"


def _backdrop_info(user_id: str, tone: str) -> Optional[dict]:
    try:
        head = _get_s3().head_object(Bucket=R2_BUCKET_NAME, Key=vitrine_backdrop_key(user_id, tone))
    except Exception:
        return None
    # L'ETag change à chaque envoi : il sert de version pour contourner les caches.
    version = str(head.get("ETag", "")).strip('"')[:12]
    return {"url": f"{R2_PUBLIC_URL}/{vitrine_backdrop_key(user_id, tone)}?v={version}"}


@router.get("/vitrine/backdrops")
async def list_vitrine_backdrops(user: dict = Depends(current_user)):
    user_id = user["sub"]
    return {tone: _backdrop_info(user_id, tone) for tone in VITRINE_TONES}


@router.post("/vitrine/backdrop")
async def upload_vitrine_backdrop(
    file: UploadFile = File(...),
    tone: str = Form(...),
    user: dict = Depends(current_user),
):
    user_id = user["sub"]
    key = vitrine_backdrop_key(user_id, tone)
    content_type = (file.content_type or "").lower()
    if content_type not in VITRINE_TYPES:
        raise HTTPException(status_code=415, detail="Format accepté : JPEG, PNG ou WebP")
    content = await file.read()
    if len(content) > VITRINE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image trop lourde (8 Mo maximum)")
    try:
        _get_s3().put_object(Bucket=R2_BUCKET_NAME, Key=key, Body=content, ContentType=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"tone": tone, **(_backdrop_info(user_id, tone) or {"url": f"{R2_PUBLIC_URL}/{key}"})}


@router.delete("/vitrine/backdrop/{tone}", status_code=204)
async def delete_vitrine_backdrop(tone: str, user: dict = Depends(current_user)):
    key = vitrine_backdrop_key(user["sub"], tone)
    try:
        _get_s3().delete_object(Bucket=R2_BUCKET_NAME, Key=key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
