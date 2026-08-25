import re
import unicodedata
from urllib.parse import urlparse

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


def _ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


def title_tokens(value: str, *, remove_noise: bool = True) -> list[str]:
    value = re.sub(r"\b\d+[.,]\d{2}\s*(?:€|eur|euros?)\b", " ", _ascii(value))
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


def summarize_results(results: list[dict]) -> dict:
    prices = sorted(float(item["price"]) for item in results if isinstance(item.get("price"), (int, float)))
    if not prices:
        return {"count": len(results), "results": results, "min": None, "max": None, "avg": None, "median": None}
    middle = len(prices) // 2
    median = prices[middle] if len(prices) % 2 else (prices[middle - 1] + prices[middle]) / 2
    return {"count": len(results), "results": results, "min": prices[0], "max": prices[-1], "avg": sum(prices) / len(prices), "median": median}
