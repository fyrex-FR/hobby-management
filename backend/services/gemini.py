import os
import time
import json
import base64
import httpx

from services.prompt import SYSTEM_PROMPT

_GEMINI_MODEL = "gemini-2.5-flash"
_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Gemini 2.5 Flash pricing (per million tokens)
_INPUT_COST_PER_M = 0.15
_OUTPUT_COST_PER_M = 0.60


def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * _INPUT_COST_PER_M + output_tokens * _OUTPUT_COST_PER_M) / 1_000_000


async def identify_gemini(front_base64: str, back_base64: str) -> dict:
    """Call Gemini 2.0 Flash. Returns dict with keys: result, latency_ms, cost_usd, error."""
    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        return {"result": None, "latency_ms": 0, "cost_usd": 0.0, "error": "GOOGLE_API_KEY not configured"}

    url = f"{_API_BASE}/{_GEMINI_MODEL}:generateContent?key={api_key}"

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": front_base64}},
                    {"inline_data": {"mime_type": "image/jpeg", "data": back_base64}},
                    {"text": "Image 1 is the FRONT of the card. Image 2 is the BACK. Start by reading the back carefully for year, card number, brand, and set. Then analyze the front for parallel finish, insert name, and surface treatment. Return the JSON."},
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 4096,
        },
    }

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=payload)
        latency_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code != 200:
            return {"result": None, "latency_ms": latency_ms, "cost_usd": 0.0, "error": f"Gemini API {resp.status_code}: {resp.text[:300]}"}

        data = resp.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown fences if present (even with responseMimeType=json, some models wrap)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        usage = data.get("usageMetadata", {})
        input_tokens = usage.get("promptTokenCount", 0)
        output_tokens = usage.get("candidatesTokenCount", 0)
        cost = _estimate_cost(input_tokens, output_tokens)

        return {"result": result, "latency_ms": latency_ms, "cost_usd": cost, "error": None}

    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        return {"result": None, "latency_ms": latency_ms, "cost_usd": 0.0, "error": str(e)}
