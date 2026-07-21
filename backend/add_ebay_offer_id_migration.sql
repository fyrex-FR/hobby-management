-- Identifiants eBay de l'annonce publiée depuis l'app (Inventory API), pour
-- pouvoir la mettre à jour / la retirer sans reparser ebay_url.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_offer_id text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_listing_id text;
