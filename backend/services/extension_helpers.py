import re
from urllib.parse import urlparse

from services.card_taxonomy import ascii_lower, classify, same_card_number

ALLOWED_IMAGE_SUFFIXES = (
    ".vinted.net", ".vinted.fr", ".ebayimg.com", ".ebaystatic.com"
)


def allowed_image_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(host.endswith(suffix) for suffix in ALLOWED_IMAGE_SUFFIXES)


def allowed_source_url(source: str, value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return False
    if source == "vinted":
        return host in {"www.vinted.fr", "vinted.fr"} and parsed.path.startswith("/items/")
    if source == "ebay":
        return host in {"www.ebay.fr", "ebay.fr", "www.ebay.com", "ebay.com"} and parsed.path.startswith("/itm/")
    return False


_NOISE = {
    "a", "avec", "and", "carte", "card", "collection", "de", "des", "du", "en",
    "excellent", "etat", "fr", "france", "l", "la", "le", "les", "lorient",
    "mint", "neuf", "new", "nm", "of", "panini", "pour", "rare", "the", "trading",
}
_QUERY_NOISE = _NOISE - {"panini"}


def title_tokens(value: str, *, remove_noise: bool = True) -> list[str]:
    value = re.sub(r"\b\d+[.,]\d{2}\s*(?:€|eur|euros?)\b", " ", ascii_lower(value))
    tokens = re.findall(r"#?\d{1,4}(?:[-/]\d{1,4})?|[a-z0-9]+", value)
    if remove_noise:
        tokens = [token for token in tokens if token not in _QUERY_NOISE]
    return list(dict.fromkeys(tokens))


def build_search_queries(title: str) -> list[str]:
    """Build deterministic eBay queries, precise first, without inventing card data."""
    precise = title_tokens(title)
    queries = [" ".join(precise)]
    without_condition = [token for token in precise if token not in {"mint", "nm", "neuf", "new"}]
    queries.append(" ".join(without_condition))
    broad = [token for token in without_condition if token not in {"rc", "rookie", "hot"} and not re.fullmatch(r"\d{1,2}", token)]
    queries.append(" ".join(broad))
    return [query[:300] for query in dict.fromkeys(queries) if query]


def merge_ranked_results(groups: list[list[dict]], source_title: str) -> list[dict]:
    source = set(title_tokens(source_title, remove_noise=True))
    unique: dict[str, dict] = {}
    for group in groups:
        for item in group:
            key = str(item.get("item_id") or item.get("url") or f"{item.get('title')}|{item.get('price')}")
            candidate = dict(item)
            words = set(title_tokens(str(candidate.get("title", "")), remove_noise=True))
            candidate["relevance"] = round(len(source & words) / max(len(source), 1), 3)
            previous = unique.get(key)
            if previous is None or candidate["relevance"] > previous["relevance"]:
                unique[key] = candidate
    return sorted(unique.values(), key=lambda item: (-item["relevance"], str(item.get("title", ""))))


def ebay_item_id(value: str) -> str:
    """Return the numeric listing id from a canonical or tracked eBay URL."""
    match = re.search(r"/itm/(?:[^/?]+/)?(\d{9,15})(?:[/?]|$)", value or "")
    return match.group(1) if match else ""


def exclude_source_listing(results: list[dict], source_url: str) -> list[dict]:
    source_id = ebay_item_id(source_url)
    source_clean = (source_url or "").split("?", 1)[0].rstrip("/")
    filtered = []
    for item in results:
        item_id = str(item.get("item_id") or "")
        item_url = str(item.get("url") or "").split("?", 1)[0].rstrip("/")
        if source_id and (source_id == item_id or source_id == ebay_item_id(item_url)):
            continue
        if source_clean and source_clean == item_url:
            continue
        filtered.append(item)
    return filtered


MATCH_RANKS = {"exact": 0, "variant": 1, "grade": 2, "other": 3, "off_card": 4}


def match_level(reference: dict, candidate: dict) -> str:
    """Situe un comparable par rapport à la carte consultée.

    `exact` = même variante et même note, la seule base de prix vraiment
    comparable. `off_card` = lot, réimpression ou autre numéro de carte, à
    sortir du calcul quel que soit son prix.
    """
    if candidate["is_lot"] or candidate["is_reprint"]:
        return "off_card"
    if not same_card_number(reference.get("card_number", ""), candidate["card_number"]):
        return "off_card"
    if candidate["bucket_key"] == reference.get("bucket_key"):
        return "exact"
    if candidate["variant_key"] == reference.get("variant_key"):
        return "variant"
    if candidate["grade_key"] == reference.get("grade_key"):
        return "grade"
    return "other"


def annotate_comparables(results: list[dict], reference: dict) -> list[dict]:
    """Étiquette chaque comparable pour que l'extension puisse les regrouper."""
    annotated = []
    for item in results:
        classification = classify(str(item.get("title", "")), condition=str(item.get("condition") or ""))
        level = match_level(reference, classification)
        annotated.append({**item, "classification": classification, "match": level, "match_rank": MATCH_RANKS[level]})
    return annotated


def summarize_results(results: list[dict]) -> dict:
    prices = sorted(float(item["price"]) for item in results if isinstance(item.get("price"), (int, float)))
    if not prices:
        return {"count": len(results), "results": results, "min": None, "max": None, "avg": None, "median": None}
    middle = len(prices) // 2
    median = prices[middle] if len(prices) % 2 else (prices[middle - 1] + prices[middle]) / 2
    return {"count": len(results), "results": results, "min": prices[0], "max": prices[-1], "avg": sum(prices) / len(prices), "median": median}
