import os
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
