-- Ventes réelles, tous canaux confondus : prix encaissé, date et canal de
-- la vente, distincts du prix demandé (`price`). Écrits quand une carte passe
-- en « vendu » (fiche, Ventes, Demandes, Salon, synchro eBay, extension
-- Vinted) et vidés si elle revient en vente. Additive, compatible N-1.
alter table cards add column if not exists sold_price numeric;
alter table cards add column if not exists sold_at timestamptz;
alter table cards add column if not exists sold_channel text
  check (sold_channel in ('vinted', 'ebay', 'salon', 'direct', 'autre'));

-- Historique eBay : la synchro enregistrait déjà le prix et la date réels.
update cards
set sold_price = ebay_sold_price, sold_at = ebay_sold_at, sold_channel = 'ebay'
where status = 'vendu' and sold_at is null and ebay_sold_at is not null;

-- Historique Salon : le prix final remplaçait `price`, la date est celle de l'encaissement.
update cards c
set sold_price = c.price, sold_at = sc.paid_at, sold_channel = 'salon'
from salon_carts sc
where sc.status = 'paid' and c.id = any(sc.card_ids)
  and c.status = 'vendu' and c.sold_at is null;
