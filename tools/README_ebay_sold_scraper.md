# eBay sold listings scraper prototype

Standalone prototype for sold/completed eBay comps. Not integrated with the app yet.

## Usage

```bash
python3 tools/ebay_sold_scraper.py "2023-24 Panini Prizm Victor Wembanyama #136" --limit 20 --pretty
```

It builds a public eBay search URL using:

- `LH_Sold=1`
- `LH_Complete=1`
- recent-ended sort

and returns normalized JSON:

- title
- price
- currency
- shipping
- total_price
- sold_date when visible
- url
- image
- condition

## Current finding

From the Jarvis server, direct eBay HTML access currently returns HTTP 403, so this may need one of these before app integration:

1. run from a less-blocked network/IP;
2. add a very low-rate cookie/session-based fetcher;
3. use a scraping API/proxy;
4. revisit eBay Finding API `findCompletedItems` if your app credentials support it;
5. use a card-specific sold-comps provider if one is affordable.

Do not wire this directly to the frontend without cache/rate-limit/backoff.
