-- Règles de livraison par tranche de prix : à la publication d'une annonce, la
-- politique d'expédition eBay (fulfillment policy) est pré-sélectionnée
-- automatiquement selon le prix de vente saisi, pour éviter d'oublier de
-- choisir le bon mode d'envoi (lettre suivie, colis R1, R2, …).
ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS shipping_rules jsonb;

-- shipping_rules : tableau JSON ordonné de tranches, ex.
--   [
--     {"max_price": 15,   "fulfillment_policy_id": "<id lettre suivie>"},
--     {"max_price": 50,   "fulfillment_policy_id": "<id colis R1>"},
--     {"max_price": null, "fulfillment_policy_id": "<id colis R2>"}
--   ]
-- Chaque tranche s'applique aux prix <= max_price (et au-dessus de la tranche
-- précédente) ; la dernière tranche a max_price = null (« et au-delà »).
