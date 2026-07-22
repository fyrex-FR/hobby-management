-- Réglages vendeur eBay par utilisateur : pour l'instant une unique image
-- réutilisable (ex. visuel expliquant les conditions d'envoi), ajoutée
-- automatiquement en 3e photo de chaque annonce publiée depuis l'app.
CREATE TABLE IF NOT EXISTS ebay_seller_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  extra_image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Accès service-only, même modèle que ebay_seller_tokens : RLS activé sans
-- policy -> uniquement le backend (clé service_role, qui contourne RLS) peut
-- lire/écrire cette table ; l'API REST publique (clé anon/authenticated) n'y
-- a jamais accès, même en lecture.
ALTER TABLE ebay_seller_settings ENABLE ROW LEVEL SECURITY;
