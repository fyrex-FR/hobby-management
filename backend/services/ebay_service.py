import os
import time
import base64
import httpx
import statistics
from typing import Optional

EBAY_CLIENT_ID = os.getenv("EBAY_CLIENT_ID", "")
EBAY_CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET", "")

EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
EBAY_IMAGE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search_by_image"
EBAY_INSIGHTS_URL = "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"

# Scope de base (Browse API : annonces actives + recherche par image).
SCOPE_BASE = "https://api.ebay.com/oauth/api_scope"
# Scope Marketplace Insights (ventes réelles). Limited Release : nécessite une
# approbation eBay sur l'application avant que le token/l'appel ne fonctionne.
SCOPE_INSIGHTS = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"

MARKETPLACE_ID = "EBAY_US"

# Cache de token par scope : {scope: {"token": str, "expires_at": float}}
_token_cache: dict = {}


async def _get_access_token(scope: str = SCOPE_BASE) -> Optional[str]:
    now = time.time()
    cached = _token_cache.get(scope)
    if cached and now < cached["expires_at"] - 60:
        return cached["token"]

    credentials = base64.b64encode(
        f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}".encode()
    ).decode()

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            EBAY_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials", "scope": scope},
        )
        if resp.status_code != 200:
            # Un scope non accordé (ex : Insights non approuvé) renvoie ici une
            # erreur ; on remonte None pour que l'appelant gère le fallback.
            return None
        data = resp.json()
        token = data.get("access_token")
        _token_cache[scope] = {
            "token": token,
            "expires_at": now + data.get("expires_in", 7200),
        }
        return token


async def _get_token_with_error(scope: str) -> tuple[Optional[str], Optional[str]]:
    """Comme _get_access_token mais renvoie aussi le détail de l'erreur eBay,
    pour diagnostiquer précisément un refus (ex : Marketplace Insights)."""
    now = time.time()
    cached = _token_cache.get(scope)
    if cached and now < cached["expires_at"] - 60:
        return cached["token"], None

    credentials = base64.b64encode(
        f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}".encode()
    ).decode()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                EBAY_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials", "scope": scope},
            )
    except Exception as e:
        return None, f"token exception: {e}"

    if resp.status_code != 200:
        return None, f"token HTTP {resp.status_code}: {resp.text[:300]}"

    data = resp.json()
    token = data.get("access_token")
    _token_cache[scope] = {"token": token, "expires_at": now + data.get("expires_in", 7200)}
    return token, None


def _summarize(prices: list[float]) -> dict:
    return {
        "count": len(prices),
        "min": round(min(prices), 2),
        "max": round(max(prices), 2),
        "avg": round(statistics.mean(prices), 2),
        "median": round(statistics.median(prices), 2),
    }


def _parse_summary_item(item: dict) -> Optional[dict]:
    """Normalise un itemSummary (Browse API) en résultat d'affichage."""
    try:
        price_obj = item.get("price", {})
        price = float(price_obj.get("value", 0))
        if price <= 0:
            return None

        image = ""
        if item.get("image"):
            image = item["image"].get("imageUrl", "")
        elif item.get("thumbnailImages"):
            image = item["thumbnailImages"][0].get("imageUrl", "")

        buying_options = item.get("buyingOptions", [])
        sale_type = "Enchère" if "AUCTION" in buying_options else "Prix fixe"

        return {
            "title": item.get("title", ""),
            "price": price,
            "currency": price_obj.get("currency", "USD"),
            "url": item.get("itemWebUrl", ""),
            "image": image,
            "condition": item.get("condition", ""),
            "end_date": item.get("itemEndDate", ""),
            "sale_type": sale_type,
            "epid": item.get("epid", ""),
            "item_id": item.get("itemId", ""),
        }
    except (ValueError, TypeError, KeyError):
        return None


async def search_ebay_listings(query: str, max_results: int = 20) -> dict:
    """Annonces ACTIVES (« En vente ») via la Browse API — recherche texte."""
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    token = await _get_access_token(SCOPE_BASE)
    if not token:
        return {"error": "Impossible d'obtenir un token eBay", "results": []}

    params = {"q": query.strip(), "sort": "newlyListed", "limit": max_results}
    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(EBAY_BROWSE_URL, headers=headers, params=params)
            if resp.status_code != 200:
                return {"error": f"eBay API {resp.status_code}: {resp.text[:500]}", "results": []}

            items = resp.json().get("itemSummaries", [])
            results = [r for r in (_parse_summary_item(i) for i in items) if r]
            prices = [r["price"] for r in results]

            if not prices:
                return {"count": 0, "results": [], "min": None, "max": None, "avg": None, "median": None}

            return {**_summarize(prices), "results": results}
        except httpx.TimeoutException:
            return {"error": "Timeout eBay", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}


async def search_ebay_by_image(image_base64: str, max_results: int = 12) -> dict:
    """Recherche VISUELLE : envoie la photo à eBay, retourne les annonces
    actives visuellement proches (« Correspondances visuelles »)."""
    if not image_base64 or not image_base64.strip():
        return {"error": "Image vide", "results": []}

    # Sécurité : retirer un éventuel préfixe data URL.
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[-1]

    token = await _get_access_token(SCOPE_BASE)
    if not token:
        return {"error": "Impossible d'obtenir un token eBay", "results": []}

    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
        "Content-Type": "application/json",
    }
    params = {"limit": max_results}

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.post(
                EBAY_IMAGE_SEARCH_URL,
                headers=headers,
                params=params,
                json={"image": image_base64},
            )
            if resp.status_code != 200:
                return {"error": f"eBay image API {resp.status_code}: {resp.text[:500]}", "results": []}

            items = resp.json().get("itemSummaries", [])
            results = [r for r in (_parse_summary_item(i) for i in items) if r]
            return {"count": len(results), "results": results}
        except httpx.TimeoutException:
            return {"error": "Timeout eBay (image)", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}


async def search_ebay_sold(query: str, max_results: int = 20) -> dict:
    """Ventes RÉELLES (« Vendues ») via la Marketplace Insights API.

    L'API est en Limited Release : tant que l'application n'est pas approuvée
    par eBay pour le scope Insights, on renvoie {"needs_approval": True} pour
    que l'UI affiche un état explicite plutôt qu'une erreur brute.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    token, token_err = await _get_token_with_error(SCOPE_INSIGHTS)
    if not token:
        # Le token pour le scope Insights n'a pas pu être obtenu : l'app n'est
        # très probablement pas encore approuvée pour ce Limited Release.
        # On remonte le détail eBay exact pour lever le doute.
        return {
            "needs_approval": True,
            "error": "Marketplace Insights non activé (token refusé par eBay).",
            "detail": token_err,
            "results": [],
        }

    params = {"q": query.strip(), "limit": max_results}
    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(EBAY_INSIGHTS_URL, headers=headers, params=params)
            if resp.status_code in (401, 403):
                return {
                    "needs_approval": True,
                    "error": f"Accès Insights refusé (HTTP {resp.status_code}).",
                    "detail": resp.text[:400],
                    "results": [],
                }
            if resp.status_code != 200:
                return {
                    "error": f"Insights API {resp.status_code}",
                    "detail": resp.text[:400],
                    "results": [],
                }

            data = resp.json()
            items = data.get("itemSales", [])

            results = []
            prices = []
            for item in items:
                try:
                    price_obj = item.get("lastSoldPrice", {})
                    price = float(price_obj.get("value", 0))
                    if price <= 0:
                        continue

                    image = ""
                    if item.get("image"):
                        image = item["image"].get("imageUrl", "")
                    elif item.get("thumbnailImages"):
                        image = item["thumbnailImages"][0].get("imageUrl", "")

                    prices.append(price)
                    results.append({
                        "title": item.get("title", ""),
                        "price": price,
                        "currency": price_obj.get("currency", "USD"),
                        "url": item.get("itemWebUrl", ""),
                        "image": image,
                        "condition": item.get("condition", ""),
                        "end_date": item.get("lastSoldDate", ""),
                        "sale_type": "Vendu",
                    })
                except (ValueError, TypeError, KeyError):
                    continue

            if not prices:
                return {"count": 0, "results": [], "min": None, "max": None, "avg": None, "median": None}

            return {**_summarize(prices), "results": results}
        except httpx.TimeoutException:
            return {"error": "Timeout eBay (Insights)", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}
