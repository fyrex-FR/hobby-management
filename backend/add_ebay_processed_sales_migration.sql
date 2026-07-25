-- Idempotence du sync des ventes eBay avec gestion du stock (quantité).
-- Le bouton « Synchroniser » étant re-cliquable, on doit ne décrémenter la
-- quantité d'une carte qu'UNE SEULE fois par ligne de commande eBay. Cette
-- table mémorise les lignes de commande déjà appliquées (clé unique
-- utilisateur + commande + ligne).
CREATE TABLE IF NOT EXISTS ebay_processed_sales (
  user_id text NOT NULL,
  order_id text NOT NULL,
  line_item_id text NOT NULL,
  sku text,
  quantity integer,
  unit_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_id, line_item_id)
);
