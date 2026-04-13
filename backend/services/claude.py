import os
import time
import json
import anthropic

from services.prompt import SYSTEM_PROMPT

# claude-haiku-4-5 pricing (per million tokens)
_INPUT_COST_PER_M = 0.80
_OUTPUT_COST_PER_M = 4.00


def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * _INPUT_COST_PER_M + output_tokens * _OUTPUT_COST_PER_M) / 1_000_000


async def identify_haiku(front_base64: str, back_base64: str) -> dict:
    """Call claude-haiku-4-5. Returns dict with keys: result, latency_ms, cost_usd, error."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    client = anthropic.Anthropic(api_key=api_key)

    t0 = time.monotonic()
    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/jpeg", "data": front_base64},
                        },
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/jpeg", "data": back_base64},
                        },
                        {
                            "type": "text",
                            "text": "Image 1 is the FRONT of the card. Image 2 is the BACK. Start by reading the back carefully for year, card number, brand, and set. Then analyze the front for parallel finish, insert name, and surface treatment. Return the JSON.",
                        },
                    ],
                }
            ],
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        result = json.loads(raw)
        cost = _estimate_cost(message.usage.input_tokens, message.usage.output_tokens)
        return {"result": result, "latency_ms": latency_ms, "cost_usd": cost, "error": None}
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        return {"result": None, "latency_ms": latency_ms, "cost_usd": 0.0, "error": str(e)}
