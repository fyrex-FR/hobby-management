-- Image vendeur uploadée dans le système photo eBay (EPS) via la Trading API
-- `UploadSiteHostedPictures`, pour pouvoir l'ajouter aux annonces existantes
-- créées à la main sur eBay (eBay interdit de mélanger photos EPS/hébergées
-- eBay et photos externes dans une même annonce ; il faut donc que l'image
-- vendeur existe elle-même côté EPS avant de l'ajouter à une annonce
-- existante).
ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS eps_image_url text;
ALTER TABLE ebay_seller_settings ADD COLUMN IF NOT EXISTS eps_source_url text;

-- eps_image_url : URL EPS (i.ebayimg.com) renvoyée par UploadSiteHostedPictures.
-- eps_source_url : URL R2 (extra_image_url) à partir de laquelle eps_image_url
-- a été généré, pour savoir quand régénérer (si l'utilisateur change son
-- image vendeur, eps_source_url != extra_image_url -> on ré-uploade).
