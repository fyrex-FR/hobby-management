-- Pricing auto : propositions de prix de l'agent, validées à la main. Additive.
create table if not exists pricing_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid not null,
  query text,
  kept jsonb not null default '[]'::jsonb,
  rejected jsonb not null default '[]'::jsonb,
  median numeric,
  proposed_price numeric,
  confidence text,
  reasoning text,
  model text,
  status text not null default 'pending',   -- pending | accepted | rejected | error
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists pricing_runs_user_created_idx on pricing_runs(user_id, created_at desc);
create index if not exists pricing_runs_card_idx on pricing_runs(card_id, created_at desc);
alter table pricing_runs enable row level security;
do $$ begin
  create policy "owner access pricing runs" on pricing_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
