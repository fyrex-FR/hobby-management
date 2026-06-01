-- Ajoute le lien eBay sur les cartes (équivalent de vinted_url).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_url text;
