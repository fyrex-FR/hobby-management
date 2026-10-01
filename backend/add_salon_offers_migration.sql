-- Offres de prix du Salon : lignes de panier (prix demandé, offre, prix final). Additive, compatible N-1.
alter table salon_carts add column if not exists lines jsonb not null default '[]'::jsonb;
