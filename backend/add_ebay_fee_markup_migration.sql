-- Surplus de frais dans le prix eBay : actif par defaut (comportement historique).
-- Un vendeur particulier eBay sans frais peut le desactiver dans les reglages eBay.
ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS fee_markup boolean NOT NULL DEFAULT true;
