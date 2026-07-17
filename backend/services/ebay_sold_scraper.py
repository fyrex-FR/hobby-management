import re
import statistics
import urllib.parse

import httpx
from bs4 import BeautifulSoup

# Page publique des annonces terminées/vendues eBay US.
EBAY_SOLD_URL = "https://www.ebay.com/sch/i.html"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_PRICE_RE = re.compile(r"[\d,]+\.?\d*")
_SOLD_DATE_RE = re.compile(r"(?:Sold|Vendu)\s+(.+)", re.IGNORECASE)


def _parse_price(text: str) -> float | None:
    """Extrait un montant d'une chaîne de prix eBay.

    Gère « $1.55 », « $1.55 to $3.00 » (on prend la borne basse), les
    séparateurs de milliers. Retourne None si rien d'exploitable.
    """
    if not text:
        return None
    match = _PRICE_RE.search(text.replace(",", ""))
    if not match:
        return None
    try:
        value = float(match.group())
        return value if value > 0 else None
    except ValueError:
        return None


def _summarize(prices: list[float]) -> dict:
    return {
        "count": len(prices),
        "min": round(min(prices), 2),
        "max": round(max(prices), 2),
        "avg": round(statistics.mean(prices), 2),
        "median": round(statistics.median(prices), 2),
    }


def _parse_items(html: str, max_results: int) -> tuple[list[dict], int]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.select("li.s-item") or soup.select("li.s-card") or soup.select(".s-item")
    raw_count = len(items)

    results: list[dict] = []
    for li in items:
        # Titre
        title_el = li.select_one(".s-item__title") or li.select_one(".s-card__title")
        title = title_el.get_text(strip=True) if title_el else ""
        # eBay insère souvent une carte fantôme « Shop on eBay » en tête.
        if not title or title.lower() in ("shop on ebay", "new listing"):
            continue
        title = re.sub(r"^New Listing", "", title, flags=re.IGNORECASE).strip()

        # Prix
        price_el = li.select_one(".s-item__price") or li.select_one(".s-card__price")
        price = _parse_price(price_el.get_text(strip=True) if price_el else "")
        if price is None:
            continue

        # Date de vente (« Sold Mar 15, 2024 »)
        end_date = ""
        for sel in (".s-item__caption--signal", ".s-item__title--tagblock", ".s-item__caption", ".s-card__caption"):
            date_el = li.select_one(sel)
            if date_el:
                m = _SOLD_DATE_RE.search(date_el.get_text(" ", strip=True))
                if m:
                    end_date = m.group(1).strip()
                    break

        # Image (souvent en lazy-load)
        img_el = li.select_one(".s-item__image-wrapper img") or li.select_one("img")
        image = ""
        if img_el:
            image = img_el.get("src") or img_el.get("data-src") or ""

        # Lien
        link_el = li.select_one("a.s-item__link") or li.select_one("a")
        url = link_el.get("href", "") if link_el else ""

        results.append({
            "title": title,
            "price": price,
            "currency": "USD",
            "url": url,
            "image": image,
            "condition": "",
            "end_date": end_date,
            "sale_type": "Vendu",
        })
        if len(results) >= max_results:
            break

    return results, raw_count


async def scrape_ebay_sold(query: str, max_results: int = 20) -> dict:
    """Récupère les ventes réelles (« Sold ») en parsant la page publique eBay US.

    Fallback tant que la Marketplace Insights API n'est pas approuvée.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    params = {
        "_nkw": query.strip(),
        "_sacat": "0",
        "LH_Sold": "1",
        "LH_Complete": "1",
        "_ipg": "60",  # 60 résultats par page
        "rt": "nc",
    }
    url = f"{EBAY_SOLD_URL}?{urllib.parse.urlencode(params)}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        try:
            resp = await client.get(url, headers=HEADERS)
            if resp.status_code != 200:
                return {
                    "error": f"eBay Sold {resp.status_code}",
                    "detail": resp.text[:200],
                    "results": [],
                    "source": "scrape",
                }

            results, raw_count = _parse_items(resp.text, max_results)
            prices = [r["price"] for r in results]

            if not prices:
                return {
                    "count": 0,
                    "results": [],
                    "min": None,
                    "max": None,
                    "avg": None,
                    "median": None,
                    "source": "scrape",
                    # Diagnostic : blocs détectés vs parsés + taille de page, pour
                    # distinguer un blocage (0 bloc / page minuscule) d'un
                    # décalage de sélecteurs (beaucoup de blocs, 0 parsé).
                    "detail": f"scrape: {len(results)}/{raw_count} blocs, {len(resp.text)} octets",
                }

            return {**_summarize(prices), "results": results, "source": "scrape"}

        except httpx.TimeoutException:
            return {"error": "Timeout eBay Sold", "results": [], "source": "scrape"}
        except Exception as e:
            return {"error": str(e), "results": [], "source": "scrape"}
