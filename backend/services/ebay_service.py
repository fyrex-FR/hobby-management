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

# Cache token en mémoire
_token_cache: dict = {"token": None, "expires_at": 0}


async def _get_access_token() -> Optional[str]:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

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
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope",
            },
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        _token_cache["token"] = data.get("access_token")
        _token_cache["expires_at"] = now + data.get("expires_in", 7200)
        return _token_cache["token"]


async def search_ebay_sold(query: str, max_results: int = 20) -> dict:
    """
    Recherche les dernières ventes eBay pour une requête donnée.
    Utilise le filtre soldItems de la Browse API.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    token = await _get_access_token()
    if not token:
        return {"error": "Impossible d'obtenir un token eBay", "results": []}

    params = {
        "q": query.strip(),
        "filter": "buyingOptions:{FIXED_PRICE},conditions:{USED|LIKE_NEW|VERY_GOOD|GOOD|ACCEPTABLE}",
        "sort": "endTimeSoonest",
        "limit": max_results,
        "fieldgroups": "EXTENDED",
    }

    # On utilise le marketplace US
    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(EBAY_BROWSE_URL, headers=headers, params=params)
            if resp.status_code != 200:
                return {"error": f"eBay API {resp.status_code}: {resp.text[:200]}", "results": []}

            data = resp.json()
            items = data.get("itemSummaries", [])

            if not items:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            results = []
            prices = []

            for item in items:
                try:
                    price_obj = item.get("price", {})
                    price = float(price_obj.get("value", 0))
                    if price <= 0:
                        continue

                    # Image
                    image = ""
                    if item.get("image"):
                        image = item["image"].get("imageUrl", "")
                    elif item.get("thumbnailImages"):
                        image = item["thumbnailImages"][0].get("imageUrl", "")

                    prices.append(price)
                    buying_options = item.get("buyingOptions", [])
                    sale_type = "Enchère" if "AUCTION" in buying_options else "Prix fixe"

                    results.append({
                        "title": item.get("title", ""),
                        "price": price,
                        "currency": price_obj.get("currency", "USD"),
                        "url": item.get("itemWebUrl", ""),
                        "image": image,
                        "condition": item.get("condition", ""),
                        "end_date": item.get("itemEndDate", ""),
                        "sale_type": sale_type,
                    })
                except (ValueError, TypeError, KeyError):
                    continue

            if not prices:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            # Trier par date de vente décroissante
            results.sort(key=lambda x: x["end_date"] or "", reverse=True)

            return {
                "count": len(prices),
                "min": round(min(prices), 2),
                "avg": round(statistics.mean(prices), 2),
                "median": round(statistics.median(prices), 2),
                "results": results[:15],
            }

        except httpx.TimeoutException:
            return {"error": "Timeout eBay", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}
