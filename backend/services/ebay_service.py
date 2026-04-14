import os
import httpx
import statistics

EBAY_CLIENT_ID = os.getenv("EBAY_CLIENT_ID", "")

EBAY_FINDING_URL = "https://svcs.ebay.com/services/search/FindingService/v1"


async def search_ebay_sold(query: str, max_results: int = 20) -> dict:
    """
    Recherche les dernières ventes soldées eBay via la Finding API (completedItems).
    Retourne prix min/avg/médian + liste triée par date décroissante.
    """
    if not query or not query.strip():
        return {"error": "Requête vide", "results": []}

    params = {
        "OPERATION-NAME": "findCompletedItems",
        "SERVICE-VERSION": "1.0.0",
        "SECURITY-APPNAME": EBAY_CLIENT_ID,
        "RESPONSE-DATA-FORMAT": "JSON",
        "keywords": query.strip(),
        "itemFilter(0).name": "SoldItemsOnly",
        "itemFilter(0).value": "true",
        "sortOrder": "EndTimeSoonest",
        "paginationInput.entriesPerPage": max_results,
        "outputSelector(0)": "SellingStatus",
        "outputSelector(1)": "PictureURLLarge",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(EBAY_FINDING_URL, params=params)
            if resp.status_code != 200:
                return {"error": f"eBay API {resp.status_code}", "results": []}

            data = resp.json()
            search_result = (
                data.get("findCompletedItemsResponse", [{}])[0]
                    .get("searchResult", [{}])[0]
            )
            items = search_result.get("item", [])

            if not items:
                return {"count": 0, "results": [], "min": None, "avg": None, "median": None}

            results = []
            prices = []

            for item in items:
                try:
                    selling = item.get("sellingStatus", [{}])[0]
                    price = float(selling.get("currentPrice", [{}])[0].get("__value__", 0))
                    if price <= 0:
                        continue

                    listing_type = item.get("listingInfo", [{}])[0].get("listingType", [""])[0]
                    sale_type = "Enchère" if listing_type == "Auction" else "Prix fixe"

                    image = ""
                    pic_large = item.get("pictureURLLarge", [])
                    pic_gallery = item.get("galleryURL", [])
                    if pic_large:
                        image = pic_large[0]
                    elif pic_gallery:
                        image = pic_gallery[0]

                    end_date_raw = item.get("listingInfo", [{}])[0].get("endTime", [""])[0]

                    condition_list = item.get("condition", [])
                    condition = ""
                    if condition_list:
                        condition = condition_list[0].get("conditionDisplayName", [""])[0]

                    prices.append(price)
                    results.append({
                        "title": item.get("title", [""])[0],
                        "price": price,
                        "currency": "USD",
                        "url": item.get("viewItemURL", [""])[0],
                        "image": image,
                        "condition": condition,
                        "end_date": end_date_raw,
                        "sale_type": sale_type,
                    })
                except (ValueError, TypeError, KeyError, IndexError):
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
