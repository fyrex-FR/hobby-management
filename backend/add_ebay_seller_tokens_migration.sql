-- Tokens OAuth eBay par utilisateur (vente multi-compte : chaque utilisateur
-- connecte son propre compte eBay). refresh_token/access_token sont chiffrés
-- (Fernet) par le backend avant écriture — cette table ne stocke jamais de
-- secret en clair.
CREATE TABLE IF NOT EXISTS ebay_seller_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  ebay_username text,
  marketplace_id text NOT NULL DEFAULT 'EBAY_FR',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Accès service-only : uniquement le backend (clé service_role, qui
-- contourne RLS) doit pouvoir lire/écrire cette table. RLS activé, aucune
-- policy ajoutée -> l'API REST publique (clé anon/authenticated) n'y a
-- jamais accès, même en lecture.
ALTER TABLE ebay_seller_tokens ENABLE ROW LEVEL SECURITY;
