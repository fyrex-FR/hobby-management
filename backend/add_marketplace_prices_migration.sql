-- Prix distincts par marketplace. `price` reste présent pour permettre un
-- rollback applicatif et sert de source lors de la reprise initiale.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS vinted_price numeric;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_price numeric;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS price_inflation numeric NOT NULL DEFAULT 0;

UPDATE cards
SET vinted_price = price
WHERE vinted_price IS NULL AND price IS NOT NULL;

ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS transaction_rate numeric NOT NULL DEFAULT 0;

