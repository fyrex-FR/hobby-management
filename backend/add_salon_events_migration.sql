-- Statistiques du Salon : événements anonymes de la page publique du stand.
-- `visitor` est un identifiant aléatoire tiré par le navigateur (aucune donnée personnelle).
create table if not exists salon_events (
  id bigserial primary key,
  user_id uuid not null,
  visitor text not null,
  kind text not null,          -- visit | view | add | cart | reserve
  card_id uuid,
  cart_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists salon_events_user_time_idx on salon_events(user_id, created_at);

alter table salon_events enable row level security;
do $$ begin
  create policy "owner read salon events" on salon_events for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
