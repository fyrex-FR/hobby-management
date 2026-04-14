import os
import time
import base64
import httpx
import statistics
from typing import Optional

EBAY_CLIENT_ID = os.getenv("EBAY_CLIENT_ID", "")
EBAY_CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET", "")

EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_INSIGHTS_URL = "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"

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
    Recherche les ventes finalisées eBay via la Marketplace Insights API.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    token = await _get_access_token()
    if not token:
        return {"error": "Impossible d'obtenir un token eBay", "results": []}

    params = {
        "q": query.strip(),
        "sort": "lastSoldDate",
        "limit": max_results,
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(EBAY_INSIGHTS_URL, headers=headers, params=params)
            if resp.status_code != 200:
                return {"error": f"eBay API {resp.status_code}: {resp.text[:500]}", "results": []}

            data = resp.json()
            items = data.get("itemSales", [])

            if not items:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

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

                    buying_options = item.get("buyingOptions", [])
                    sale_type = "Enchère" if "AUCTION" in buying_options else "Prix fixe"

                    prices.append(price)
                    results.append({
                        "title": item.get("title", ""),
                        "price": price,
                        "currency": price_obj.get("currency", "USD"),
                        "url": item.get("itemWebUrl", ""),
                        "image": image,
                        "condition": item.get("condition", ""),
                        "end_date": item.get("lastSoldDate", ""),
                        "sale_type": sale_type,
                    })
                except (ValueError, TypeError, KeyError):
                    continue

            if not prices:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            return {
                "count": len(prices),
                "min": round(min(prices), 2),
                "avg": round(statistics.mean(prices), 2),
                "median": round(statistics.median(prices), 2),
                "results": results,
            }

        except httpx.TimeoutException:
            return {"error": "Timeout eBay", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}
