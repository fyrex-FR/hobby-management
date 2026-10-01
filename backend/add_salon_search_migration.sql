-- Statistiques du Salon : texte des recherches des visiteurs (recherches sans résultat).
alter table salon_events add column if not exists query text;
