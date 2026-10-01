"""Module Salon : stand public par QR, paniers visiteurs, encaissement.

Gestion réservée à l'admin (`require_admin`). Les routes publiques ne servent
que le stock `a_vendre` du compte propriétaire du stand.
"""
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .admin import require_admin
from .cards import fetch_all_rows
from services.share_public import public_card

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
HOLD_MINUTES = 30
MAX_CART = 50
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _check(resp: httpx.Response, ok=(200, 201, 204)):
    if resp.status_code not in ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp


def _price(card: dict) -> Optional[float]:
    return public_card(card, True).get("price")


SLIM_FIELDS = (
    "id", "player", "team", "year", "brand", "set_name", "insert_name", "parallel_name", "card_number",
    "card_type", "numbered", "is_rookie", "image_front_url", "image_back_url", "condition_notes",
    "grading_company", "grading_grade", "created_at",
)


def _slim(card: dict) -> dict:
    return {**{k: card.get(k) for k in SLIM_FIELDS}, "price": _price(card)}


def _money(v) -> float:
    return round(float(v), 2)


async def _stand_by_token(client: httpx.AsyncClient, token: str) -> dict:
    resp = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"token": f"eq.{token}", "limit": "1"}), (200,))
    rows = resp.json()
    if not rows or not rows[0].get("is_open"):
        raise HTTPException(status_code=404, detail="Stand fermé ou introuvable")
    return rows[0]


async def _active_carts(client: httpx.AsyncClient, user_id: str) -> list[dict]:
    resp = _check(await client.get(
        f"{SUPABASE_URL}/rest/v1/salon_carts",
        headers=_headers(),
        params={"user_id": f"eq.{user_id}", "status": "eq.active", "expires_at": f"gt.{_iso(_now())}"},
    ), (200,))
    return resp.json()


# ── Public ───────────────────────────────────────────────────────────────────

@router.get("/salon/{token}/stock")
async def public_stock(token: str):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        cards = await fetch_all_rows(client, f"{SUPABASE_URL}/rest/v1/cards", {"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "order": "created_at.desc"})
        carts = await _active_carts(client, user_id)
    cards = [_slim(c) for c in cards]
    cards = [c for c in cards if c.get("price") is not None]
    reserved = sorted({cid for cart in carts for cid in cart["card_ids"]})
    return {"title": stand.get("title"), "hold_minutes": HOLD_MINUTES, "paypal_me": stand.get("paypal_me"), "cards": cards, "reserved": reserved}


@router.get("/salon/{token}/live")
async def public_live(token: str):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        carts = await _active_carts(client, user_id)
        paid = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(),
            params={"user_id": f"eq.{user_id}", "status": "eq.paid", "select": "card_ids"},
        ), (200,)).json()
    return {
        "reserved": sorted({cid for cart in carts for cid in cart["card_ids"]}),
        "sold": sorted({cid for cart in paid for cid in cart["card_ids"]}),
    }


class CartCreate(BaseModel):
    card_ids: list[str]
    pseudo: Optional[str] = None
    offers: dict[str, float] = {}


@router.post("/salon/{token}/carts", status_code=201)
async def create_cart(token: str, body: CartCreate):
    try:
        ids = list(dict.fromkeys(str(uuid.UUID(c)) for c in body.card_ids))[:MAX_CART]
    except ValueError:
        raise HTTPException(status_code=400, detail="Carte invalide")
    if not ids:
        raise HTTPException(status_code=400, detail="Panier vide")
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        user_id = stand["user_id"]
        resp = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=_headers(),
            params={"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "id": f"in.({','.join(ids)})"},
        ), (200,))
        found = {c["id"]: c for c in resp.json()}
        active = await _active_carts(client, user_id)
        taken = {cid for cart in active for cid in cart["card_ids"]}
        unavailable = [i for i in ids if i not in found or _price(found[i]) is None or i in taken]
        if unavailable:
            raise HTTPException(status_code=409, detail={"unavailable": unavailable})
        mine = {c["code"] for c in active}
        code = next(c for c in (("".join(secrets.choice(CODE_ALPHABET) for _ in range(4))) for _ in range(50)) if c not in mine)
        lines = []
        for i in ids:
            asked = _money(_price(found[i]))
            offer = body.offers.get(i)
            if offer is not None and not (0 < offer < asked):
                raise HTTPException(status_code=400, detail="Offre invalide")
            lines.append({"card_id": i, "asked": asked, "offer": _money(offer) if offer is not None else None, "final": asked, "state": "offered" if offer is not None else "none"})
        total = _money(sum(l["final"] for l in lines))
        ins = _check(await client.post(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), json={
            "user_id": user_id,
            "code": code,
            "card_ids": ids,
            "lines": lines,
            "total": total,
            "pseudo": (body.pseudo or "").strip()[:60] or None,
            "expires_at": _iso(_now() + timedelta(minutes=HOLD_MINUTES)),
        }))
    cart = ins.json()[0]
    return {"code": cart["code"], "total": cart["total"], "expires_at": cart["expires_at"]}


@router.get("/salon/{token}/carts/{code}")
async def public_cart(token: str, code: str):
    async with httpx.AsyncClient() as client:
        stand = await _stand_by_token(client, token)
        rows = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(),
            params={"user_id": f"eq.{stand['user_id']}", "code": f"eq.{code.upper()}", "order": "created_at.desc", "limit": "1"},
        ), (200,)).json()
        if not rows:
            raise HTTPException(status_code=404, detail="Panier introuvable")
        cart = rows[0]
        cards = {}
        if cart["card_ids"]:
            found = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"id": f"in.({','.join(cart['card_ids'])})"}), (200,)).json()
            cards = {c["id"]: c for c in found}
    status = cart["status"]
    if status == "active" and cart["expires_at"] <= _iso(_now()):
        status = "expired"
    lines = [{**l, "player": cards.get(l["card_id"], {}).get("player"), "set_name": cards.get(l["card_id"], {}).get("set_name"), "year": cards.get(l["card_id"], {}).get("year")} for l in (cart.get("lines") or [])]
    return {"code": cart["code"], "status": status, "total": cart["total"], "expires_at": cart["expires_at"], "lines": lines}


# ── Admin ────────────────────────────────────────────────────────────────────

class StandUpdate(BaseModel):
    is_open: Optional[bool] = None
    title: Optional[str] = None
    paypal_me: Optional[str] = None


@router.get("/salon/stand")
async def get_stand(user: dict = Depends(require_admin)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"user_id": f"eq.{user_id}"}), (200,)).json()
        if rows:
            return rows[0]
        ins = _check(await client.post(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), json={"user_id": user_id, "token": secrets.token_urlsafe(9)}))
    return ins.json()[0]


@router.patch("/salon/stand")
async def update_stand(body: StandUpdate, user: dict = Depends(require_admin)):
    payload = body.model_dump(exclude_none=True)
    if "paypal_me" in payload:
        handle = payload["paypal_me"].strip().removeprefix("https://www.paypal.me/").removeprefix("https://paypal.me/").strip("/")
        if handle and not re.fullmatch(r"[A-Za-z0-9.]{1,40}", handle):
            raise HTTPException(status_code=400, detail="Pseudo PayPal.me invalide")
        payload["paypal_me"] = handle or None
    async with httpx.AsyncClient() as client:
        resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/salon_stands", headers=_headers(), params={"user_id": f"eq.{user['sub']}"}, json=payload))
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Stand introuvable")
    return rows[0]


async def _with_cards(client: httpx.AsyncClient, carts: list[dict]) -> list[dict]:
    ids = sorted({cid for c in carts for cid in c["card_ids"]})
    cards: dict = {}
    if ids:
        rows = _check(await client.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"id": f"in.({','.join(ids)})"}), (200,)).json()
        cards = {c["id"]: public_card(c, True) for c in rows}
    return [{**c, "cards": [cards[i] for i in c["card_ids"] if i in cards]} for c in carts]


@router.get("/salon/carts")
async def list_carts(user: dict = Depends(require_admin)):
    since = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    async with httpx.AsyncClient() as client:
        resp = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts",
            headers=_headers(),
            params={"user_id": f"eq.{user['sub']}", "created_at": f"gte.{_iso(since)}", "order": "created_at.desc"},
        ), (200,))
        return await _with_cards(client, resp.json())


@router.get("/salon/carts/by-code/{code}")
async def cart_by_code(code: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        resp = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/salon_carts",
            headers=_headers(),
            params={"user_id": f"eq.{user['sub']}", "code": f"eq.{code.upper()}", "order": "created_at.desc", "limit": "1"},
        ), (200,))
        rows = resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Panier introuvable")
        return (await _with_cards(client, rows))[0]


async def _get_cart(client: httpx.AsyncClient, cart_id: str, user_id: str) -> dict:
    resp = _check(await client.get(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), params={"id": f"eq.{cart_id}", "user_id": f"eq.{user_id}"}), (200,))
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Panier introuvable")
    return rows[0]


async def _set_cart(client: httpx.AsyncClient, cart_id: str, user_id: str, payload: dict) -> dict:
    resp = _check(await client.patch(f"{SUPABASE_URL}/rest/v1/salon_carts", headers=_headers(), params={"id": f"eq.{cart_id}", "user_id": f"eq.{user_id}"}, json=payload))
    return resp.json()[0]


class LineUpdate(BaseModel):
    final: Optional[float] = None
    state: Optional[str] = None


@router.patch("/salon/carts/{cart_id}/lines/{card_id}")
async def update_line(cart_id: str, card_id: str, body: LineUpdate, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        lines = cart.get("lines") or []
        line = next((l for l in lines if l["card_id"] == card_id), None)
        if line is None:
            raise HTTPException(status_code=404, detail="Ligne introuvable")
        if body.state == "accepted" and line.get("offer") is not None:
            line["final"], line["state"] = line["offer"], "accepted"
        elif body.state == "refused":
            line["final"], line["state"] = line["asked"], "refused"
        elif body.final is not None:
            if body.final <= 0:
                raise HTTPException(status_code=400, detail="Prix invalide")
            line["final"] = _money(body.final)
            if line.get("offer") is not None:
                line["state"] = "accepted" if line["final"] == line["offer"] else "countered"
        else:
            raise HTTPException(status_code=400, detail="Rien à modifier")
        total = _money(sum(l["final"] for l in lines))
        return await _set_cart(client, cart_id, user["sub"], {"lines": lines, "total": total})


@router.post("/salon/carts/{cart_id}/pay")
async def pay_cart(cart_id: str, user: dict = Depends(require_admin)):
    user_id = user["sub"]
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user_id)
        if cart["status"] == "paid":
            return cart
        ids = cart["card_ids"]
        rows = _check(await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=_headers(),
            params={"user_id": f"eq.{user_id}", "status": "eq.a_vendre", "id": f"in.({','.join(ids)})"},
        ), (200,)).json()
        gone = [i for i in ids if i not in {c["id"] for c in rows}]
        if gone:
            raise HTTPException(status_code=409, detail={"unavailable": gone})
        finals = {l["card_id"]: l["final"] for l in (cart.get("lines") or [])}
        for cid in ids:
            payload = {"status": "vendu", "is_listed": False}
            if cid in finals:
                payload["price"] = finals[cid]
            _check(await client.patch(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params={"user_id": f"eq.{user_id}", "id": f"eq.{cid}"}, json=payload))
        return await _set_cart(client, cart_id, user_id, {"status": "paid", "paid_at": _iso(_now())})


@router.post("/salon/carts/{cart_id}/cancel")
async def cancel_cart(cart_id: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] == "paid":
            raise HTTPException(status_code=409, detail="Panier déjà encaissé")
        return await _set_cart(client, cart_id, user["sub"], {"status": "cancelled"})


@router.post("/salon/carts/{cart_id}/extend")
async def extend_cart(cart_id: str, user: dict = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        cart = await _get_cart(client, cart_id, user["sub"])
        if cart["status"] != "active":
            raise HTTPException(status_code=409, detail="Panier non actif")
        return await _set_cart(client, cart_id, user["sub"], {"expires_at": _iso(_now() + timedelta(minutes=HOLD_MINUTES))})
