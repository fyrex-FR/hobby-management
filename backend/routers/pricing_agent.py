"""Pricing auto : l'agent OpenClaw propose des prix, Xavier les valide.

Routes `/pricing-agent/*` : jeton dédié (PRICING_AGENT_TOKEN), limitées au compte
PRICING_AGENT_USER_ID. Routes `/pricing-runs/*` : admin. Un run n'écrit jamais
dans `cards` ; seul « accept » écrit `ebay_price`.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .admin import require_admin
from .cards import fetch_all_rows
from services.ebay_sold_scraper import scrape_ebay_sold
from services.marketplace_pricing import propose_from_sold

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
RECENT_DAYS = 7
CARD_FIELDS = (
    "id,player,team,year,brand,set_name,insert_name,parallel_name,card_number,card_type,numbered,"
    "is_rookie,grading_company,grading_grade,condition_notes,image_front_url"
)


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _check(resp: httpx.Response, ok=(200, 201, 204)):
    if resp.status_code not in ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp


def agent_user_id(x_agent_token: str = Header(default="")) -> str:
    expected = os.environ.get("PRICING_AGENT_TOKEN", "")
    user_id = os.environ.get("PRICING_AGENT_USER_ID", "")
    if not expected or not user_id or not secrets.compare_digest(x_agent_token, expected):
        raise HTTPException(status_code=401, detail="invalid_agent_token")
    return user_id


def search_text(card: dict) -> str:
    parts = [card.get(k) for k in ("player", "year", "set_name", "insert_name", "parallel_name", "numbered")]
    parts.insert(3, card.get("card_number"))
    return " ".join(str(p) for p in parts if p).strip()


@router.get("/pricing-agent/queue")
async def queue(limit: int = 20, user_id: str = Depends(agent_user_id)):
    limit = max(1, min(limit, 50))
    since = (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).isoformat()
    async with httpx.AsyncClient() as client:
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", {
            "select": CARD_FIELDS, "user_id": f"eq.{user_id}", "status": "eq.a_vendre", "ebay_price": "is.null", "price": "is.null",
        })
        runs = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/pricing_runs", {
            "select": "card_id", "user_id": f"eq.{user_id}", "created_at": f"gte.{since}",
        })
    recent = {r["card_id"] for r in runs}
    todo = [c for c in cards if c["id"] not in recent][:limit]
    return {"cards": [{**c, "query": search_text(c)} for c in todo]}


class CompsRequest(BaseModel):
    card_id: Optional[str] = None
    query: str


@router.post("/pricing-agent/comps")
async def comps(body: CompsRequest, user_id: str = Depends(agent_user_id)):
    return await scrape_ebay_sold(body.query, 40)


class Sale(BaseModel):
    title: str
    price: float = Field(gt=0)
    currency: str = "EUR"
    url: str = ""
    end_date: str = ""
    reason: str = ""


class RunRequest(BaseModel):
    card_id: str
    query: str = ""
    kept: list[Sale] = []
    rejected: list[Sale] = []
    confidence: str = "low"
    reasoning: str = ""
    model: str = ""
    error: str = ""


@router.post("/pricing-agent/runs", status_code=201)
async def create_run(body: RunRequest, user_id: str = Depends(agent_user_id)):
    if any(s.currency.upper() != "EUR" for s in body.kept):
        raise HTTPException(status_code=422, detail="Seules les ventes en EUR peuvent être retenues.")
    row = {
        "user_id": user_id, "card_id": body.card_id, "query": body.query,
        "kept": [s.model_dump() for s in body.kept], "rejected": [s.model_dump() for s in body.rejected],
        "confidence": body.confidence, "reasoning": body.reasoning[:2000], "model": body.model, "status": "pending",
    }
    if body.error or not body.kept:
        row.update(status="error", reasoning=(body.error or body.reasoning or "Aucune vente comparable retenue.")[:2000])
    else:
        row["median"], row["proposed_price"] = propose_from_sold([s.price for s in body.kept])
    async with httpx.AsyncClient() as client:
        card = (await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(),
                                 params={"id": f"eq.{body.card_id}", "user_id": f"eq.{user_id}", "select": "id"})).json()
        if not card:
            raise HTTPException(status_code=404, detail="Carte introuvable")
        resp = _check(await client.post(f"{SUPABASE_URL}/rest/v1/pricing_runs", headers=_headers(), json=row))
    return resp.json()[0]


@router.get("/pricing-runs")
async def list_runs(status: Optional[str] = None, user: dict = Depends(require_admin)):
    params = {"select": "*", "user_id": f"eq.{user['sub']}", "order": "created_at.desc", "limit": "200"}
    if status:
        params["status"] = f"eq.{status}"
    async with httpx.AsyncClient() as client:
        runs = _check(await client.get(f"{SUPABASE_URL}/rest/v1/pricing_runs", headers=_headers(), params=params)).json()
        ids = ",".join({r["card_id"] for r in runs})
        cards = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(),
                                        params={"id": f"in.({ids})", "select": CARD_FIELDS + ",ebay_price"})).json() if ids else []
    by_id = {c["id"]: c for c in cards}
    return {"runs": [{**r, "card": by_id.get(r["card_id"])} for r in runs]}


class DecisionRequest(BaseModel):
    price: Optional[float] = Field(default=None, gt=0)


async def _get_pending(client: httpx.AsyncClient, run_id: str, user_id: str) -> dict:
    rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/pricing_runs", headers=_headers(),
                                   params={"id": f"eq.{run_id}", "user_id": f"eq.{user_id}"})).json()
    if not rows:
        raise HTTPException(status_code=404, detail="Run introuvable")
    if rows[0]["status"] not in ("pending", "error"):
        raise HTTPException(status_code=409, detail="Run déjà traité")
    return rows[0]


@router.post("/pricing-runs/{run_id}/accept")
async def accept(run_id: str, body: DecisionRequest = DecisionRequest(), user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        run = await _get_pending(client, run_id, user["sub"])
        price = body.price if body.price is not None else run.get("proposed_price")
        if price is None:
            raise HTTPException(status_code=422, detail="Aucun prix à valider : indique un prix.")
        _check(await client.patch(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(),
                                  params={"id": f"eq.{run['card_id']}", "user_id": f"eq.{user['sub']}"},
                                  json={"ebay_price": price}))
        resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/pricing_runs", headers=_headers(),
                                         params={"id": f"eq.{run_id}"},
                                         json={"status": "accepted", "decided_at": datetime.now(timezone.utc).isoformat()}))
    return resp.json()[0]


@router.post("/pricing-runs/{run_id}/reject")
async def reject(run_id: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        await _get_pending(client, run_id, user["sub"])
        resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/pricing_runs", headers=_headers(),
                                         params={"id": f"eq.{run_id}"},
                                         json={"status": "rejected", "decided_at": datetime.now(timezone.utc).isoformat()}))
    return resp.json()[0]
