-- Salon : remise à zéro du bilan du jour (le bilan repart de cet instant, rien n'est supprimé).
alter table salon_stands add column if not exists stats_reset_at timestamptz;
