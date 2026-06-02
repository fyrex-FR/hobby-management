-- Ajoute la quantité d'exemplaires possédés pour une carte (défaut 1).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
