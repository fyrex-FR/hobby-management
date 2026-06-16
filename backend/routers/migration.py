import os
import asyncio
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .admin import require_admin

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "card-images"

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "card-images")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

_state = {
    "status": "idle",  # idle | running | done | error
    "total": 0,
    "migrated": 0,
    "errors": [],
    "started_at": None,
    "finished_at": None,
}

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
}


def _get_s3():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


async def _list_supabase_files(client: httpx.AsyncClient, prefix: str, limit=1000, offset=0):
    resp = await client.post(
        f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
        headers=HEADERS,
        json={"prefix": prefix, "limit": limit, "offset": offset},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


async def _list_all_files() -> list[str]:
    all_files = []
    async with httpx.AsyncClient() as client:
        folders = await _list_supabase_files(client, prefix="")
        for item in folders:
            if item.get("id") is None:
                folder_name = item["name"]
                offset = 0
                while True:
                    files = await _list_supabase_files(client, prefix=folder_name, limit=1000, offset=offset)
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


async def _download_from_supabase(client: httpx.AsyncClient, path: str) -> bytes:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    resp = await client.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.content


async def _run_migration():
    global _state
    _state = {
        "status": "running",
        "total": 0,
        "migrated": 0,
        "errors": [],
        "started_at": time.time(),
        "finished_at": None,
    }

    try:
        files = await _list_all_files()
        _state["total"] = len(files)

        if not files:
            _state["status"] = "done"
            _state["finished_at"] = time.time()
            return

        s3 = _get_s3()

        async with httpx.AsyncClient() as client:
            for path in files:
                try:
                    content = await _download_from_supabase(client, path)
                    s3.put_object(
                        Bucket=R2_BUCKET_NAME,
                        Key=path,
                        Body=content,
                        ContentType="image/jpeg",
                    )
                    _state["migrated"] += 1
                except Exception as e:
                    _state["errors"].append({"path": path, "error": str(e)})
                # Yield to event loop periodically
                if _state["migrated"] % 10 == 0:
                    await asyncio.sleep(0)

        _state["status"] = "done"
    except Exception as e:
        _state["status"] = "error"
        _state["errors"].append({"path": "_global", "error": str(e)})
    finally:
        _state["finished_at"] = time.time()


@router.get("/admin/migration/status")
async def migration_status(_: dict = Depends(require_admin)):
    return _state


@router.get("/admin/migration/preview")
async def migration_preview(_: dict = Depends(require_admin)):
    files = await _list_all_files()
    return {"total_files": len(files), "sample": files[:20]}


@router.post("/admin/migration/start")
async def migration_start(_: dict = Depends(require_admin)):
    if _state["status"] == "running":
        raise HTTPException(status_code=409, detail="Migration already running")
    asyncio.create_task(_run_migration())
    return {"message": "Migration started"}


_verify_state = {
    "status": "idle",  # idle | running | done | error
    "checked": 0,
    "total": 0,
    "missing": [],
}


async def _run_verify():
    global _verify_state
    _verify_state = {"status": "running", "checked": 0, "total": 0, "missing": []}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/cards",
                headers={**HEADERS, "Content-Type": "application/json"},
                params={"select": "id,image_front_url,image_back_url"},
                timeout=30,
            )
            resp.raise_for_status()
            cards = resp.json()

        old_prefix = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/"
        paths_to_check = []

        for card in cards:
            for field in ("image_front_url", "image_back_url"):
                url = card.get(field)
                if not url:
                    continue
                if url.startswith(old_prefix):
                    path = url[len(old_prefix):]
                elif R2_PUBLIC_URL and url.startswith(f"{R2_PUBLIC_URL}/"):
                    path = url[len(f"{R2_PUBLIC_URL}/"):]
                else:
                    continue
                paths_to_check.append({"card_id": card["id"], "field": field, "path": path})

        _verify_state["total"] = len(paths_to_check)
        s3 = _get_s3()

        for item in paths_to_check:
            try:
                s3.head_object(Bucket=R2_BUCKET_NAME, Key=item["path"])
            except Exception:
                _verify_state["missing"].append(item)
            _verify_state["checked"] += 1
            if _verify_state["checked"] % 50 == 0:
                await asyncio.sleep(0)

        _verify_state["status"] = "done"
    except Exception as e:
        _verify_state["status"] = "error"
        _verify_state["missing"].append({"card_id": "_global", "field": "error", "path": str(e)})


@router.post("/admin/migration/verify")
async def migration_verify_start(_: dict = Depends(require_admin)):
    if _verify_state["status"] == "running":
        raise HTTPException(status_code=409, detail="Verification already running")
    asyncio.create_task(_run_verify())
    return {"message": "Verification started"}


@router.get("/admin/migration/verify")
async def migration_verify_status(_: dict = Depends(require_admin)):
    return {
        "status": _verify_state["status"],
        "checked": _verify_state["checked"],
        "total": _verify_state["total"],
        "missing": len(_verify_state["missing"]),
        "all_good": _verify_state["status"] == "done" and len(_verify_state["missing"]) == 0,
        "missing_files": _verify_state["missing"][:50],
    }


@router.post("/admin/migration/update-urls")
async def migration_update_urls(_: dict = Depends(require_admin)):
    old_prefix = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/"
    new_prefix = f"{R2_PUBLIC_URL}/"

    async with httpx.AsyncClient() as client:
        # Update front URLs
        resp1 = await client.patch(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
            params={"image_front_url": f"like.{old_prefix}*"},
            json={"image_front_url": None},  # placeholder
            timeout=30,
        )

    # Use SQL via Supabase's RPC or direct postgrest won't work for REPLACE.
    # Instead, generate the SQL for manual execution and return it.
    sql = f"""UPDATE cards
SET image_front_url = REPLACE(image_front_url, '{old_prefix}', '{new_prefix}')
WHERE image_front_url LIKE '{old_prefix}%';

UPDATE cards
SET image_back_url = REPLACE(image_back_url, '{old_prefix}', '{new_prefix}')
WHERE image_back_url LIKE '{old_prefix}%';"""

    # Execute via Supabase's pg endpoint (rpc)
    async with httpx.AsyncClient() as client:
        # Try executing via rpc if available, otherwise return SQL
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"query": sql},
            timeout=30,
        )
        if resp.status_code == 404:
            # RPC not available — return SQL for manual execution
            return {"executed": False, "sql": sql, "message": "Exécutez ce SQL dans le SQL Editor de Supabase"}

    return {"executed": True, "message": "URLs mises à jour"}
