#!/usr/bin/env python3
"""Small standalone eBay sold/completed listings scraper.

Usage:
  python tools/ebay_sold_scraper.py "2023-24 Panini Prizm Victor Wembanyama #136" --limit 20

Notes:
- This intentionally does NOT integrate with the app yet.
- It scrapes the public eBay search HTML with LH_Sold=1 and LH_Complete=1.
- Keep usage low and cache results later if this becomes app-facing.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from html import unescape
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen

EBAY_SEARCH_URL = "https://www.ebay.com/sch/i.html"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

PRICE_RE = re.compile(r"(?P<currency>US \$|C \$|AU \$|EUR |GBP |\$|€|£)\s*(?P<amount>[0-9][0-9,]*(?:\.[0-9]{2})?)")
SHIPPING_RE = re.compile(r"(?P<amount>[0-9][0-9,]*(?:\.[0-9]{2})?)")

CURRENCY_MAP = {
    "US $": "USD",
    "C $": "CAD",
    "AU $": "AUD",
    "$": "USD",
    "EUR ": "EUR",
    "€": "EUR",
    "GBP ": "GBP",
    "£": "GBP",
}


@dataclass
class SoldListing:
    title: str
    price: float | None
    currency: str | None
    shipping: float | None
    total_price: float | None
    sold_date: str
    url: str
    image: str
    condition: str
    raw_price: str
    raw_shipping: str


def build_sold_url(query: str, limit: int = 60, site: str = "ebay.com") -> str:
    base = f"https://www.{site}/sch/i.html" if not site.startswith("http") else site.rstrip("/") + "/sch/i.html"
    params = {
        "_nkw": query,
        "LH_Sold": "1",
        "LH_Complete": "1",
        "_sop": "13",  # recently ended
        "_ipg": str(min(max(limit, 10), 240)),
    }
    return f"{base}?{urlencode(params)}"


def parse_price(text: str) -> tuple[float | None, str | None]:
    text = " ".join((text or "").split())
    match = PRICE_RE.search(text)
    if not match:
        return None, None
    amount = float(match.group("amount").replace(",", ""))
    currency = CURRENCY_MAP.get(match.group("currency"), match.group("currency").strip())
    return amount, currency


def parse_shipping(text: str) -> float | None:
    text = " ".join((text or "").split())
    if not text or "free" in text.lower():
        return 0.0 if "free" in text.lower() else None
    match = SHIPPING_RE.search(text)
    if not match:
        return None
    return float(match.group("amount").replace(",", ""))


def clean_title(title: str) -> str:
    title = " ".join((title or "").split())
    prefixes = ["New Listing", "SPONSORED"]
    for prefix in prefixes:
        if title.lower().startswith(prefix.lower()):
            title = title[len(prefix):].strip()
    return title


def strip_tags(html: str) -> str:
    html = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    html = re.sub(r"<style\b[^>]*>.*?</style>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", html)
    return " ".join(unescape(text).split())


def first_match(text: str, patterns: list[str], flags: int = re.I | re.S) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            value = match.group(1)
            if value:
                return strip_tags(value) if "<" in value else " ".join(unescape(value).split())
    return ""


def first_attr(text: str, patterns: list[str], flags: int = re.I | re.S) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            return unescape(match.group(1))
    return ""


def normalize_item_url(url: str) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    if url.startswith("/"):
        url = "https://www.ebay.com" + url
    return url.split("?")[0]


def parse_sold_listings(html: str, limit: int) -> list[SoldListing]:
    # eBay markup changes often. This parser intentionally uses tolerant regexes
    # around each <li class="s-item"> card instead of depending on browser APIs.
    chunks = re.split(r'<li\b[^>]*class="[^"]*s-item[^"]*"[^>]*>', html, flags=re.I)
    results: list[SoldListing] = []

    for chunk in chunks[1:]:
        chunk = chunk.split('</li>', 1)[0]

        title = clean_title(first_match(chunk, [
            r'<div[^>]*class="[^"]*s-item__title[^"]*"[^>]*>(.*?)</div>',
            r'<span[^>]*role="heading"[^>]*>(.*?)</span>',
        ]))
        if not title or title.lower() in {"shop on ebay", "results matching fewer words"}:
            continue

        raw_price = first_match(chunk, [r'<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>(.*?)</span>'])
        price, currency = parse_price(raw_price)
        if price is None:
            continue

        raw_shipping = first_match(chunk, [
            r'<span[^>]*class="[^"]*s-item__shipping[^"]*"[^>]*>(.*?)</span>',
            r'<span[^>]*class="[^"]*s-item__logisticsCost[^"]*"[^>]*>(.*?)</span>',
        ])
        shipping = parse_shipping(raw_shipping)
        total_price = price + shipping if shipping is not None else price

        sold_date = first_match(chunk, [
            r'<span[^>]*class="[^"]*POSITIVE[^"]*"[^>]*>(Sold[^<]*|Ended[^<]*)</span>',
            r'(Sold\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})',
            r'(Ended\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})',
        ])

        url = normalize_item_url(first_attr(chunk, [r'<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"']))
        image = first_attr(chunk, [
            r'<img[^>]*(?:src|data-src)="([^"]+)"',
        ])
        condition = first_match(chunk, [
            r'<span[^>]*class="[^"]*SECONDARY_INFO[^"]*"[^>]*>(.*?)</span>',
            r'<span[^>]*class="[^"]*s-item__subtitle[^"]*"[^>]*>(.*?)</span>',
        ])

        results.append(
            SoldListing(
                title=title,
                price=round(price, 2),
                currency=currency,
                shipping=round(shipping, 2) if shipping is not None else None,
                total_price=round(total_price, 2) if total_price is not None else None,
                sold_date=sold_date,
                url=url,
                image=image,
                condition=condition,
                raw_price=raw_price,
                raw_shipping=raw_shipping,
            )
        )
        if len(results) >= limit:
            break

    return results

def summarize(results: list[SoldListing]) -> dict[str, Any]:
    prices = [r.total_price for r in results if r.total_price is not None and r.currency == "USD"]
    if not prices:
        return {"count": len(results), "usd_count": 0, "min": None, "avg": None, "median": None, "max": None}
    return {
        "count": len(results),
        "usd_count": len(prices),
        "min": round(min(prices), 2),
        "avg": round(statistics.mean(prices), 2),
        "median": round(statistics.median(prices), 2),
        "max": round(max(prices), 2),
    }


def fetch_sold_listings(query: str, limit: int = 20, timeout: float = 20.0, site: str = "ebay.com") -> dict[str, Any]:
    url = build_sold_url(query, limit=max(limit, 60), site=site)
    req = Request(url, headers=DEFAULT_HEADERS)
    with urlopen(req, timeout=timeout) as response:
        html = response.read().decode("utf-8", errors="replace")

    listings = parse_sold_listings(html, limit=limit)
    blocked = not listings and any(marker in html.lower() for marker in ["captcha", "verify yourself", "robot", "pardon our interruption"])

    return {
        "query": query,
        "source_url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "blocked_or_captcha": blocked,
        "summary": summarize(listings),
        "results": [asdict(item) for item in listings],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape eBay sold/completed listing comps as JSON")
    parser.add_argument("query", help="eBay search query")
    parser.add_argument("--limit", type=int, default=20, help="Max sold listings to return")
    parser.add_argument("--site", default="ebay.com", help="eBay site host, e.g. ebay.com or ebay.fr")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = parser.parse_args()

    try:
        data = fetch_sold_listings(args.query, limit=args.limit, site=args.site)
    except HTTPError as exc:
        data = {
            "query": args.query,
            "source_url": build_sold_url(args.query, limit=max(args.limit, 60), site=args.site),
            "error": f"HTTP {exc.code}: {exc.reason}",
            "blocked_or_captcha": exc.code in (403, 429),
            "summary": {"count": 0, "usd_count": 0, "min": None, "avg": None, "median": None, "max": None},
            "results": [],
        }
    except Exception as exc:
        data = {"query": args.query, "error": str(exc), "results": []}

    print(json.dumps(data, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0 if not data.get("error") else 1


if __name__ == "__main__":
    raise SystemExit(main())
