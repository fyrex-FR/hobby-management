-- Module Salon : stand public (QR) + paniers visiteurs. Réservé au compte admin côté API.
create table if not exists salon_stands (
  user_id uuid primary key,
  token text not null unique,
  is_open boolean not null default true,
  title text
);

create table if not exists salon_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code text not null,
  card_ids uuid[] not null default '{}',
  total numeric not null default 0,
  pseudo text,
  status text not null default 'active',   -- active | paid | cancelled
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);
create index if not exists salon_carts_user_status_idx on salon_carts(user_id, status, created_at desc);

alter table salon_stands enable row level security;
alter table salon_carts enable row level security;
do $$ begin
  create policy "owner access salon stands" on salon_stands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner access salon carts" on salon_carts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
