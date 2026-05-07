import os
import time
import json
import httpx

from services.prompt import SYSTEM_PROMPT


async def identify_openclaw(front_base64: str, back_base64: str) -> dict:
    """Call a private OpenClaw vision proxy.

    Expected proxy contract:
    POST {OPENCLAW_VISION_URL}
    Headers: Authorization: Bearer {OPENCLAW_VISION_TOKEN}  (optional but recommended)
    Body: { front_base64, back_base64, system_prompt }

    Returns the same envelope as identify_gemini:
    { result, latency_ms, cost_usd, error }
    """
    url = os.environ.get("OPENCLAW_VISION_URL", "").strip()
    if not url:
        return {"result": None, "latency_ms": 0, "cost_usd": 0.0, "error": "OPENCLAW_VISION_URL not configured"}

    token = os.environ.get("OPENCLAW_VISION_TOKEN", "").strip()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "front_base64": front_base64,
        "back_base64": back_base64,
        "system_prompt": SYSTEM_PROMPT,
    }

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
        latency_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code != 200:
            return {"result": None, "latency_ms": latency_ms, "cost_usd": 0.0, "error": f"OpenClaw proxy {resp.status_code}: {resp.text[:300]}"}

        data = resp.json()
        result = data.get("result", data)

        if isinstance(result, str):
            raw = result.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            result = json.loads(raw)

        return {
            "result": result,
            "latency_ms": latency_ms,
            "cost_usd": float(data.get("cost_usd", 0.0) or 0.0) if isinstance(data, dict) else 0.0,
            "error": None,
        }

    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        return {"result": None, "latency_ms": latency_ms, "cost_usd": 0.0, "error": str(e)}
