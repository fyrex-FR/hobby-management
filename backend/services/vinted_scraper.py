import httpx
import re
import statistics
from typing import Optional

VINTED_SEARCH_URL = "https://www.vinted.fr/api/v2/catalog/items"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Referer": "https://www.vinted.fr/",
    "Origin": "https://www.vinted.fr",
}


async def _get_session_cookie() -> Optional[str]:
    """Récupère un cookie de session Vinted (nécessaire pour l'API)."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
        try:
            resp = await client.get("https://www.vinted.fr", headers=HEADERS)
            cookies = dict(resp.cookies)
            # Vinted utilise _vinted_fr_session
            for key in cookies:
                if "session" in key.lower() or "vinted" in key.lower():
                    return f"{key}={cookies[key]}"
        except Exception:
            pass
    return None


async def search_vinted_prices(query: str, max_results: int = 20) -> dict:
    """
    Recherche des annonces Vinted et retourne prix min, moyen, médian.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    cookie = await _get_session_cookie()

    headers = dict(HEADERS)
    if cookie:
        headers["Cookie"] = cookie

    params = {
        "search_text": query.strip(),
        "order": "relevance",
        "per_page": max_results,
        "page": 1,
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(VINTED_SEARCH_URL, headers=headers, params=params)
            if resp.status_code != 200:
                return {"error": f"Vinted API {resp.status_code}", "results": []}

            data = resp.json()
            items = data.get("items", [])

            if not items:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            results = []
            prices = []
            for item in items:
                try:
                    price_str = item.get("price", "0")
                    # price peut être "12.50" ou {"amount": "12.50", ...}
                    if isinstance(price_str, dict):
                        price_str = price_str.get("amount", "0")
                    price = float(str(price_str).replace(",", "."))
                    if price <= 0:
                        continue
                    prices.append(price)
                    results.append({
                        "title": item.get("title", ""),
                        "price": price,
                        "url": f"https://www.vinted.fr/items/{item.get('id', '')}",
                        "image": item.get("photo", {}).get("url", "") if item.get("photo") else "",
                    })
                except (ValueError, TypeError):
                    continue

            if not prices:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            return {
                "count": len(prices),
                "min": round(min(prices), 2),
                "avg": round(statistics.mean(prices), 2),
                "median": round(statistics.median(prices), 2),
                "results": results[:10],  # top 10 pour l'affichage
            }

        except httpx.TimeoutException:
            return {"error": "Timeout Vinted", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}
