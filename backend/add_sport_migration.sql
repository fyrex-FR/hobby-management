ALTER TABLE cards ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'Basket';

UPDATE cards SET sport = 'Basket' WHERE sport IS NULL;

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_sport_check;
ALTER TABLE cards ADD CONSTRAINT cards_sport_check
  CHECK (sport IN ('Basket', 'Foot', 'Baseball', 'Football US', 'Hockey', 'Autre'));
