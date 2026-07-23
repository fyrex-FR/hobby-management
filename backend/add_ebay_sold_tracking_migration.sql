-- Suivi des ventes eBay : quand une carte se vend sur eBay, le sync
-- (POST /ebay/selling/sync-sold, Fulfillment API) la passe en statut « vendu »
-- et enregistre ici le prix RÉEL de vente et la date de la commande, distincts
-- du prix d'annonce (`price`) qui reste le prix demandé.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_sold_price numeric;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_sold_at timestamptz;
