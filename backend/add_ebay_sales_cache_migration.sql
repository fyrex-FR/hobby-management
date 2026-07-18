-- Cache des ventes eBay récupérées (scraping) par carte, pour affichage
-- instantané et pour soulager le proxy de scraping.
CREATE TABLE IF NOT EXISTS ebay_sales_cache (
  card_id uuid PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
