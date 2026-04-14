import re
import httpx
import statistics
from bs4 import BeautifulSoup

EBAY_SOLD_URL = "https://www.ebay.com/sch/i.html"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _parse_price(text: str) -> float | None:
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    if match:
        try:
            return float(match.group().replace(",", ""))
        except ValueError:
            return None
    return None


async def search_ebay_sold(query: str, max_results: int = 20) -> dict:
    """
    Scrape les ventes finalisées eBay (LH_Sold=1 & LH_Complete=1).
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    params = {
        "_nkw": query.strip(),
        "LH_Sold": "1",
        "LH_Complete": "1",
        "_sop": "13",  # tri par date de fin décroissante
        "_ipg": max_results,
    }

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        try:
            resp = await client.get(EBAY_SOLD_URL, headers=HEADERS, params=params)
            if resp.status_code != 200:
                return {"error": f"eBay {resp.status_code}", "results": []}

            soup = BeautifulSoup(resp.text, "html.parser")
            items = soup.select("li.s-item")

            results = []
            prices = []

            for item in items:
                try:
                    # Titre
                    title_el = item.select_one(".s-item__title")
                    if not title_el:
                        continue
                    title = title_el.get_text(strip=True)
                    if title in ("Shop on eBay", "Results matching fewer words"):
                        continue

                    # Prix
                    price_el = item.select_one(".s-item__price")
                    if not price_el:
                        continue
                    price = _parse_price(price_el.get_text(strip=True))
                    if not price or price <= 0:
                        continue

                    # URL
                    link_el = item.select_one("a.s-item__link")
                    url = link_el["href"] if link_el else ""

                    # Image
                    img_el = item.select_one("img.s-item__image-img")
                    image = img_el.get("src", "") or img_el.get("data-src", "") if img_el else ""

                    # Date de vente
                    date_el = item.select_one(".s-item__ended-date") or item.select_one(".POSITIVE")
                    end_date = date_el.get_text(strip=True) if date_el else ""

                    # Type de vente
                    type_el = item.select_one(".s-item__purchase-options-with-icon") or item.select_one(".s-item__formatBuyItNow")
                    if type_el:
                        sale_type = "Prix fixe" if "Buy It Now" in type_el.get_text() else "Enchère"
                    else:
                        sale_type = "Enchère"

                    # Condition
                    condition_el = item.select_one(".SECONDARY_INFO")
                    condition = condition_el.get_text(strip=True) if condition_el else ""

                    prices.append(price)
                    results.append({
                        "title": title,
                        "price": price,
                        "currency": "USD",
                        "url": url,
                        "image": image,
                        "condition": condition,
                        "end_date": end_date,
                        "sale_type": sale_type,
                    })
                except Exception:
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
