"""Préparation d'une annonce eBay : business policies du vendeur connecté,
catégorie suggérée, titre généré — sans rien publier (voir routers/ebay_selling.py).

Toute requête vers les Sell APIs (Account, Taxonomy) utilise le token
utilisateur (get_valid_access_token), jamais le token client-credentials de
ebay_service.py qui ne porte que des scopes publics.
"""

import asyncio
import os
import re
from typing import Optional

import httpx

from .ebay_oauth import SELL_MARKETPLACE_ID

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

ACCOUNT_API = "https://api.ebay.com/sell/account/v1"
TAXONOMY_API = "https://api.ebay.com/commerce/taxonomy/v1"

TITLE_MAX_LEN = 80

# Cache en mémoire du category tree id par marketplace (ne change pas).
_category_tree_cache: dict[str, str] = {}


def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _sell_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "X-EBAY-C-MARKETPLACE-ID": SELL_MARKETPLACE_ID,
        "Content-Type": "application/json",
    }


async def get_card(card_id: str, user_id: str) -> Optional[dict]:
    """Charge une carte en vérifiant qu'elle appartient à l'utilisateur."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=_supabase_headers(),
            params={"id": f"eq.{card_id}", "user_id": f"eq.{user_id}", "select": "*"},
        )
    if resp.status_code != 200:
        return None
    rows = resp.json()
    return rows[0] if rows else None


async def get_business_policies(access_token: str) -> dict:
    """Récupère les 3 policies (paiement/retour/livraison) du vendeur pour
    EBAY_FR. Renvoie leurs IDs si présentes, None sinon par catégorie, plus
    un booléen global `configured`."""
    endpoints = {
        "payment": ("payment_policy", "paymentPolicies", "paymentPolicyId"),
        "return": ("return_policy", "returnPolicies", "returnPolicyId"),
        "fulfillment": ("fulfillment_policy", "fulfillmentPolicies", "fulfillmentPolicyId"),
    }
    result: dict = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for key, (path, list_key, id_key) in endpoints.items():
            try:
                resp = await client.get(
                    f"{ACCOUNT_API}/{path}",
                    headers=_sell_headers(access_token),
                    params={"marketplace_id": SELL_MARKETPLACE_ID},
                )
                if resp.status_code != 200:
                    result[key] = None
                    continue
                items = resp.json().get(list_key, [])
                result[key] = items[0][id_key] if items else None
            except Exception:
                result[key] = None

    return {
        **result,
        "configured": all(result.get(k) for k in endpoints),
    }


async def _get_category_tree_id(access_token: str) -> Optional[str]:
    if SELL_MARKETPLACE_ID in _category_tree_cache:
        return _category_tree_cache[SELL_MARKETPLACE_ID]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{TAXONOMY_API}/get_default_category_tree_id",
                headers=_sell_headers(access_token),
                params={"marketplace_id": SELL_MARKETPLACE_ID},
            )
        if resp.status_code != 200:
            return None
        tree_id = resp.json().get("categoryTreeId")
        if tree_id:
            _category_tree_cache[SELL_MARKETPLACE_ID] = tree_id
        return tree_id
    except Exception:
        return None


async def suggest_category(access_token: str, query: str) -> Optional[dict]:
    """Suggère une catégorie eBay (id + nom) à partir d'un texte libre."""
    if not query.strip():
        return None
    tree_id = await _get_category_tree_id(access_token)
    if not tree_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{TAXONOMY_API}/category_tree/{tree_id}/get_category_suggestions",
                headers=_sell_headers(access_token),
                params={"q": query},
            )
        if resp.status_code != 200:
            return None
        suggestions = resp.json().get("categorySuggestions", [])
        if not suggestions:
            return None
        cat = suggestions[0].get("category", {})
        return {"id": cat.get("categoryId"), "name": cat.get("categoryName")}
    except Exception:
        return None


def _truncate_title(text: str, max_len: int = TITLE_MAX_LEN) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rsplit(" ", 1)[0]
    return cut if cut else text[:max_len]


def build_listing_title(card: dict) -> str:
    """Titre d'annonce ≤ 80 caractères à partir des attributs de la carte."""
    grading = ""
    if card.get("grading_company") and card.get("grading_grade"):
        grading = f"{card['grading_company']} {card['grading_grade']}"

    parts = [
        card.get("year"),
        card.get("brand") or card.get("set_name"),
        card.get("set_name") if card.get("brand") and card.get("set_name") != card.get("brand") else None,
        card.get("player"),
        card.get("insert_name"),
        card.get("parallel_name") if card.get("parallel_name") and card.get("parallel_name") != "Base" else None,
        f"#{card['card_number']}" if card.get("card_number") else None,
        card.get("numbered"),
        "RC" if card.get("is_rookie") else None,
        grading or None,
    ]
    title = " ".join(str(p) for p in parts if p)
    return _truncate_title(title)


async def build_preview(card: dict, access_token: str) -> dict:
    title = build_listing_title(card)
    policies, category = await asyncio.gather(
        get_business_policies(access_token),
        suggest_category(access_token, title),
    )
    return {
        "connected": True,
        "title": title,
        "category": category,
        "policies": policies,
        "price": card.get("price"),
        "marketplace_id": SELL_MARKETPLACE_ID,
    }
