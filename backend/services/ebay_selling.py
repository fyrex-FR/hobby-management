"""Préparation d'une annonce eBay : business policies du vendeur connecté,
catégorie suggérée, titre généré — sans rien publier (voir routers/ebay_selling.py).

Toute requête vers les Sell APIs (Account, Taxonomy) utilise le token
utilisateur (get_valid_access_token), jamais le token client-credentials de
ebay_service.py qui ne porte que des scopes publics.
"""

import asyncio
import logging
import os
import re
from typing import Optional

import httpx

from .ebay_oauth import SELL_MARKETPLACE_ID

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
logger = logging.getLogger("ebay_selling")

ACCOUNT_API = "https://api.ebay.com/sell/account/v1"
TAXONOMY_API = "https://api.ebay.com/commerce/taxonomy/v1"
INVENTORY_API = "https://api.ebay.com/sell/inventory/v1"

TITLE_MAX_LEN = 80
SELL_CONTENT_LANGUAGE = "fr-FR"

# Condition volontairement générique et universelle (valeur ConditionEnum
# stable dans toutes les catégories eBay), plutôt que de deviner des valeurs
# spécifiques aux cartes gradées (GRADED + conditionDescriptors) qui n'ont
# pas pu être vérifiées contre la doc eBay (réseau bloqué depuis ce sandbox).
# Le grading (société + note) est de toute façon indiqué en clair dans le
# titre et la description, sans risque de rejet par l'API.
DEFAULT_CONDITION = "USED_EXCELLENT"


class EbayApiError(Exception):
    """Erreur eBay avec le corps de réponse brut, pour un diagnostic exact
    sans avoir besoin d'accès réseau à eBay pour la reproduire."""

    def __init__(self, step: str, status_code: int, body: str):
        self.step = step
        self.status_code = status_code
        self.body = body[:800]
        super().__init__(f"{step} (HTTP {status_code}): {self.body}")

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
        "Content-Language": SELL_CONTENT_LANGUAGE,
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


async def _get_one_policy(client: httpx.AsyncClient, access_token: str, path: str, list_key: str, id_key: str) -> Optional[str]:
    try:
        resp = await client.get(
            f"{ACCOUNT_API}/{path}",
            headers=_sell_headers(access_token),
            params={"marketplace_id": SELL_MARKETPLACE_ID},
        )
        if resp.status_code != 200:
            return None
        items = resp.json().get(list_key, [])
        return items[0][id_key] if items else None
    except Exception:
        return None


async def get_business_policies(access_token: str) -> dict:
    """Récupère les 3 policies (paiement/retour/livraison) du vendeur pour
    EBAY_FR, en parallèle (plutôt qu'en séquence : 3 allers-retours eBay
    l'un après l'autre peuvent suffire à dépasser le délai que tolère un
    proxy devant l'app). Renvoie leurs IDs si présentes, None sinon par
    catégorie, plus un booléen global `configured`."""
    endpoints = {
        "payment": ("payment_policy", "paymentPolicies", "paymentPolicyId"),
        "return": ("return_policy", "returnPolicies", "returnPolicyId"),
        "fulfillment": ("fulfillment_policy", "fulfillmentPolicies", "fulfillmentPolicyId"),
    }
    async with httpx.AsyncClient(timeout=15) as client:
        keys = list(endpoints.keys())
        values = await asyncio.gather(*(
            _get_one_policy(client, access_token, *endpoints[k]) for k in keys
        ))
    result = dict(zip(keys, values))

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


async def update_card_fields(card_id: str, user_id: str, fields: dict) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/cards",
            headers=_supabase_headers(),
            params={"id": f"eq.{card_id}", "user_id": f"eq.{user_id}"},
            json=fields,
        )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Supabase update cards {resp.status_code}: {resp.text[:300]}")


def build_listing_description(card: dict, title: str) -> str:
    lines = [f"<p>{title}</p>", "<ul>"]
    for label, value in [
        ("Année", card.get("year")),
        ("Marque", card.get("brand")),
        ("Set", card.get("set_name")),
        ("Parallel", card.get("parallel_name") if card.get("parallel_name") != "Base" else None),
        ("Numéro", card.get("card_number")),
        ("Tirage", card.get("numbered")),
        ("État", card.get("condition_notes") or "Mint / Near Mint"),
    ]:
        if value:
            lines.append(f"<li>{label} : {value}</li>")
    if card.get("is_rookie"):
        lines.append("<li>Rookie Card</li>")
    if card.get("grading_company") and card.get("grading_grade"):
        lines.append(f"<li>Gradée {card['grading_company']} {card['grading_grade']}"
                      + (f" (cert. {card['grading_cert']})" if card.get("grading_cert") else "") + "</li>")
    lines.append("</ul>")
    return "\n".join(lines)


def build_aspects(card: dict) -> dict:
    """Item specifics standards pour des cartes de sport. Les valeurs qui ne
    correspondent à aucune liste attendue par eBay pour la catégorie sont
    généralement ignorées plutôt que de faire échouer l'appel."""
    aspects: dict[str, list[str]] = {}

    def add(name: str, value):
        if value:
            aspects[name] = [str(value)]

    add("Player/Athlete", card.get("player"))
    add("Season", card.get("year"))
    add("Manufacturer", card.get("brand"))
    add("Set", card.get("set_name"))
    if card.get("parallel_name") and card.get("parallel_name") != "Base":
        add("Parallel/Variety", card.get("parallel_name"))
    add("Card Number", card.get("card_number"))
    if card.get("card_type") in ("auto", "auto_patch"):
        add("Autographed", "Yes")
    if card.get("grading_company"):
        add("Professional Grader", card.get("grading_company"))
        add("Grade", card.get("grading_grade"))
        add("Certification Number", card.get("grading_cert"))
    return aspects


async def _find_existing_offer_id(access_token: str, sku: str) -> Optional[str]:
    """Un offer existe déjà pour ce sku+marketplace (publish déjà tenté) ?
    Rend l'endpoint de publication rejouable sans dupliquer les offres."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INVENTORY_API}/offer",
                headers=_sell_headers(access_token),
                params={"sku": sku, "marketplace_id": SELL_MARKETPLACE_ID},
            )
        if resp.status_code != 200:
            return None
        offers = resp.json().get("offers", [])
        return offers[0]["offerId"] if offers else None
    except Exception:
        return None


async def publish_card(card: dict, access_token: str, title: str, price: float, category_id: str, policies: dict) -> dict:
    """Enchaîne inventory_item -> offer (créée ou réutilisée) -> publish.
    Lève EbayApiError avec le détail exact en cas d'échec à n'importe quelle
    étape ; ne modifie la carte en base qu'en cas de succès complet."""
    sku = card["id"]
    image_urls = [u for u in [card.get("image_front_url"), card.get("image_back_url")] if u]

    async with httpx.AsyncClient(timeout=20) as client:
        # 1. Inventory item + vérification d'une offer existante EN PARALLÈLE
        # (les deux sont indépendants) plutôt qu'en séquence, pour réduire le
        # temps total de la requête (risque de timeout d'un proxy intermédiaire
        # sur un enchaînement de plusieurs appels eBay).
        put_resp, offer_id = await asyncio.gather(
            client.put(
                f"{INVENTORY_API}/inventory_item/{sku}",
                headers=_sell_headers(access_token),
                json={
                    "availability": {"shipToLocationAvailability": {"quantity": 1}},
                    "condition": DEFAULT_CONDITION,
                    "product": {
                        "title": title,
                        "description": build_listing_description(card, title),
                        "aspects": build_aspects(card),
                        "imageUrls": image_urls,
                    },
                },
            ),
            _find_existing_offer_id(access_token, sku),
        )
        resp = put_resp
        if resp.status_code not in (200, 201, 204):
            raise EbayApiError("Création de la fiche produit", resp.status_code, resp.text)
        offer_body = {
            "sku": sku,
            "marketplaceId": SELL_MARKETPLACE_ID,
            "format": "FIXED_PRICE",
            "availableQuantity": 1,
            "categoryId": category_id,
            "listingDescription": build_listing_description(card, title),
            "listingPolicies": {
                "paymentPolicyId": policies["payment"],
                "returnPolicyId": policies["return"],
                "fulfillmentPolicyId": policies["fulfillment"],
            },
            "pricingSummary": {"price": {"value": str(price), "currency": "EUR"}},
        }
        if offer_id:
            resp = await client.put(f"{INVENTORY_API}/offer/{offer_id}", headers=_sell_headers(access_token), json=offer_body)
            if resp.status_code not in (200, 204):
                raise EbayApiError("Mise à jour de l'offre", resp.status_code, resp.text)
        else:
            resp = await client.post(f"{INVENTORY_API}/offer", headers=_sell_headers(access_token), json=offer_body)
            if resp.status_code not in (200, 201):
                raise EbayApiError("Création de l'offre", resp.status_code, resp.text)
            offer_id = resp.json().get("offerId")
            if not offer_id:
                raise EbayApiError("Création de l'offre", resp.status_code, "offerId manquant dans la réponse")

        # 3. Publish.
        resp = await client.post(f"{INVENTORY_API}/offer/{offer_id}/publish", headers=_sell_headers(access_token), json={})
        if resp.status_code not in (200, 201):
            raise EbayApiError("Publication de l'annonce", resp.status_code, resp.text)
        listing_id = resp.json().get("listingId")
        if not listing_id:
            raise EbayApiError("Publication de l'annonce", resp.status_code, "listingId manquant dans la réponse")

    ebay_url = f"https://www.ebay.fr/itm/{listing_id}"
    card_update = {
        "ebay_url": ebay_url,
        "ebay_offer_id": offer_id,
        "ebay_listing_id": listing_id,
        "price": price,
        "status": "a_vendre" if card.get("status") not in ("vendu",) else card["status"],
    }
    try:
        await update_card_fields(sku, card["user_id"], card_update)
    except RuntimeError as e:
        if "ebay_offer_id" not in str(e) and "ebay_listing_id" not in str(e):
            raise
        logger.warning(
            "Colonnes eBay offer/listing absentes dans Supabase; enregistrement minimal pour la carte %s",
            sku,
        )
        await update_card_fields(sku, card["user_id"], {
            "ebay_url": ebay_url,
            "price": price,
            "status": card_update["status"],
        })
    return {"published": True, "ebay_url": ebay_url, "listing_id": listing_id, "offer_id": offer_id}


async def withdraw_card(card: dict, access_token: str) -> dict:
    offer_id = card.get("ebay_offer_id")
    if not offer_id:
        raise EbayApiError("Retrait de l'annonce", 400, "Cette carte n'a pas d'annonce eBay connue.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{INVENTORY_API}/offer/{offer_id}/withdraw", headers=_sell_headers(access_token), json={})
    # 404 = déjà retirée côté eBay (offre inconnue) : on nettoie quand même la carte.
    if resp.status_code not in (200, 204, 404):
        raise EbayApiError("Retrait de l'annonce", resp.status_code, resp.text)

    await update_card_fields(card["id"], card["user_id"], {
        "ebay_url": None,
        "ebay_offer_id": None,
        "ebay_listing_id": None,
    })
    return {"withdrawn": True}


async def update_offer_price(card: dict, access_token: str, new_price: float) -> dict:
    offer_id = card.get("ebay_offer_id")
    if not offer_id:
        raise EbayApiError("Mise à jour du prix", 400, "Cette carte n'a pas d'annonce eBay connue.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{INVENTORY_API}/offer/{offer_id}", headers=_sell_headers(access_token))
        if resp.status_code != 200:
            raise EbayApiError("Lecture de l'offre", resp.status_code, resp.text)
        offer = resp.json()
        offer["pricingSummary"] = {**offer.get("pricingSummary", {}), "price": {"value": str(new_price), "currency": "EUR"}}
        # Champs en lecture seule que l'API refuse en entrée.
        for ro_field in ("offerId", "listing", "status"):
            offer.pop(ro_field, None)

        resp = await client.put(f"{INVENTORY_API}/offer/{offer_id}", headers=_sell_headers(access_token), json=offer)
        if resp.status_code not in (200, 204):
            raise EbayApiError("Mise à jour du prix", resp.status_code, resp.text)

    await update_card_fields(card["id"], card["user_id"], {"price": new_price})
    return {"updated": True, "price": new_price}
