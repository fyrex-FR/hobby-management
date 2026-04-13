import os
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

from .auth import current_user
from services.claude import identify_haiku
from services.gemini import identify_gemini

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


class CompareRequest(BaseModel):
    front_base64: str
    back_base64: str
    front_url: Optional[str] = None
    back_url: Optional[str] = None


class ScoreRequest(BaseModel):
    winner: str  # "haiku" | "gemini" | "tie" | "both_wrong"
    correct_fields: Optional[list[str]] = None
    notes: Optional[str] = None


@router.post("/compare")
async def compare(body: CompareRequest, user: dict = Depends(current_user)):
    """Run Haiku and Gemini Flash in parallel on the same card images and store the result."""

    haiku_task = identify_haiku(body.front_base64, body.back_base64)
    gemini_task = identify_gemini(body.front_base64, body.back_base64)

    haiku_out, gemini_out = await asyncio.gather(haiku_task, gemini_task)

    row = {
        "user_id": user["sub"],
        "front_url": body.front_url,
        "back_url": body.back_url,
        "haiku_result": haiku_out["result"],
        "haiku_latency_ms": haiku_out["latency_ms"],
        "haiku_cost_usd": haiku_out["cost_usd"],
        "haiku_error": haiku_out["error"],
        "gemini_result": gemini_out["result"],
        "gemini_latency_ms": gemini_out["latency_ms"],
        "gemini_cost_usd": gemini_out["cost_usd"],
        "gemini_error": gemini_out["error"],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/ai_comparisons",
            headers=_headers(),
            json=row,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    saved = resp.json()
    record = saved[0] if isinstance(saved, list) else saved

    return {
        "id": record["id"],
        "haiku": {
            **(haiku_out["result"] or {}),
            "_meta": {
                "latency_ms": haiku_out["latency_ms"],
                "cost_usd": haiku_out["cost_usd"],
                "error": haiku_out["error"],
            },
        },
        "gemini": {
            **(gemini_out["result"] or {}),
            "_meta": {
                "latency_ms": gemini_out["latency_ms"],
                "cost_usd": gemini_out["cost_usd"],
                "error": gemini_out["error"],
            },
        },
    }


@router.post("/compare/{comparison_id}/score")
async def score(comparison_id: str, body: ScoreRequest, user: dict = Depends(current_user)):
    """Store your manual verdict on which model won for a given comparison."""

    allowed_winners = {"haiku", "gemini", "tie", "both_wrong"}
    if body.winner not in allowed_winners:
        raise HTTPException(status_code=422, detail=f"winner must be one of {allowed_winners}")

    patch = {
        "winner": body.winner,
        "correct_fields": body.correct_fields,
        "notes": body.notes,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/ai_comparisons",
            headers=_headers(),
            params={"id": f"eq.{comparison_id}", "user_id": f"eq.{user['sub']}"},
            json=patch,
        )

    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    if isinstance(data, list):
        if not data:
            raise HTTPException(status_code=404, detail="Comparison not found")
        return data[0]
    return data


@router.get("/compare/stats")
async def stats(user: dict = Depends(current_user)):
    """Aggregate win counts and average costs across all scored comparisons."""

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/ai_comparisons",
            headers=_headers(),
            params={
                "user_id": f"eq.{user['sub']}",
                "winner": "not.is.null",
                "select": "winner,haiku_cost_usd,gemini_cost_usd,haiku_latency_ms,gemini_latency_ms,correct_fields",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    rows = resp.json()
    if not rows:
        return {"total_scored": 0}

    wins = {"haiku": 0, "gemini": 0, "tie": 0, "both_wrong": 0}
    haiku_costs, gemini_costs = [], []
    haiku_latencies, gemini_latencies = [], []

    for r in rows:
        wins[r["winner"]] = wins.get(r["winner"], 0) + 1
        if r["haiku_cost_usd"] is not None:
            haiku_costs.append(float(r["haiku_cost_usd"]))
        if r["gemini_cost_usd"] is not None:
            gemini_costs.append(float(r["gemini_cost_usd"]))
        if r["haiku_latency_ms"] is not None:
            haiku_latencies.append(r["haiku_latency_ms"])
        if r["gemini_latency_ms"] is not None:
            gemini_latencies.append(r["gemini_latency_ms"])

    def avg(lst):
        return round(sum(lst) / len(lst), 4) if lst else None

    return {
        "total_scored": len(rows),
        "wins": wins,
        "avg_cost_usd": {
            "haiku": avg(haiku_costs),
            "gemini": avg(gemini_costs),
        },
        "avg_latency_ms": {
            "haiku": avg(haiku_latencies),
            "gemini": avg(gemini_latencies),
        },
    }
