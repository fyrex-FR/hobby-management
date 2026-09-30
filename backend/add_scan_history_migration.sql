-- Historique du Scan live. Migration additive, compatible avec la version N-1.
create table if not exists scan_history (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  ident jsonb not null,
  estimate_value numeric,
  estimate_status text,
  thumb text,
  front text,
  back text,
  card_id uuid references cards(id) on delete set null
);

create index if not exists scan_history_user_created_idx on scan_history(user_id, created_at desc);

alter table scan_history enable row level security;

do $$ begin
  create policy "owner access scan history" on scan_history
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
