"""
Migrate all images from Supabase Storage (card-images bucket) to Cloudflare R2.

Usage:
    pip install boto3 httpx python-dotenv
    python migrate_to_r2.py

Required env vars (in backend/.env):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
"""

import os
import sys
import time
from pathlib import Path

import boto3
import httpx
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "card-images"

R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "card-images")
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
}


def list_supabase_files(prefix="", limit=1000, offset=0):
    """List files in Supabase Storage bucket."""
    resp = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
        headers=HEADERS,
        json={"prefix": prefix, "limit": limit, "offset": offset},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def list_all_files():
    """List all files recursively by first listing user folders, then files in each."""
    all_files = []
    folders = list_supabase_files(prefix="", limit=1000)

    for item in folders:
        if item.get("id") is None:
            # It's a folder — list its contents
            folder_name = item["name"]
            offset = 0
            while True:
                files = list_supabase_files(prefix=folder_name, limit=1000, offset=offset)
                if not files:
                    break
                for f in files:
                    if f.get("id") is not None:
                        all_files.append(f"{folder_name}/{f['name']}")
                if len(files) < 1000:
                    break
                offset += 1000
        else:
            all_files.append(item["name"])

    return all_files


def download_from_supabase(path: str) -> bytes:
    """Download a file from Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    resp = httpx.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.content


def upload_to_r2(path: str, content: bytes):
    """Upload a file to R2."""
    s3.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=path,
        Body=content,
        ContentType="image/jpeg",
    )


def migrate():
    print("Listing all files in Supabase Storage...")
    files = list_all_files()
    total = len(files)
    print(f"Found {total} files to migrate.\n")

    if total == 0:
        print("Nothing to migrate.")
        return

    success = 0
    errors = []

    for i, path in enumerate(files, 1):
        try:
            content = download_from_supabase(path)
            upload_to_r2(path, content)
            success += 1
            if i % 50 == 0 or i == total:
                print(f"  [{i}/{total}] migrated — last: {path}")
        except Exception as e:
            errors.append((path, str(e)))
            print(f"  [{i}/{total}] ERROR: {path} — {e}")
        # Small delay to avoid rate limiting
        if i % 100 == 0:
            time.sleep(0.5)

    print(f"\nMigration complete: {success}/{total} succeeded")
    if errors:
        print(f"\n{len(errors)} errors:")
        for path, err in errors:
            print(f"  - {path}: {err}")


def update_database_urls():
    """Print the SQL to update image URLs in the cards table."""
    old_prefix = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/"
    new_prefix = f"{R2_PUBLIC_URL}/"

    print("\n--- Run this SQL in Supabase SQL Editor to update URLs ---\n")
    print(f"""UPDATE cards
SET image_front_url = REPLACE(image_front_url, '{old_prefix}', '{new_prefix}')
WHERE image_front_url LIKE '{old_prefix}%';

UPDATE cards
SET image_back_url = REPLACE(image_back_url, '{old_prefix}', '{new_prefix}')
WHERE image_back_url LIKE '{old_prefix}%';""")
    print("\n--- End SQL ---\n")


if __name__ == "__main__":
    if "--dry-run" in sys.argv:
        files = list_all_files()
        print(f"Would migrate {len(files)} files. First 10:")
        for f in files[:10]:
            print(f"  {f}")
    elif "--update-urls" in sys.argv:
        update_database_urls()
    else:
        migrate()
        update_database_urls()
