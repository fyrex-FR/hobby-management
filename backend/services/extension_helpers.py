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


def build_search_query(result: dict, fallback: str) -> str:
    parts = [result.get(key) for key in ("year", "brand", "set", "player", "card_number", "parallel")]
    query = " ".join(str(value).strip() for value in parts if value).strip()
    return query or fallback[:300]
