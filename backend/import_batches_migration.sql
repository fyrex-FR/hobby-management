-- Sas d'import persistant. Migration additive et compatible avec la version N-1.
alter table cards add column if not exists serial_number text;

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Import de cartes',
  status text not null default 'open' check (status in ('open', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete restrict,
  user_id uuid not null,
  position int not null default 0,
  front_image_url text not null,
  back_image_url text,
  front_filename text,
  back_filename text,
  identification jsonb,
  fingerprint jsonb,
  classification text not null default 'processing'
    check (classification in ('processing', 'match', 'probable', 'new', 'insufficient', 'error')),
  matches jsonb not null default '[]'::jsonb,
  error text,
  action text check (action in ('shelve', 'create', 'increment', 'ignore', 'review')),
  target_card_id uuid references cards(id) on delete set null,
  created_card_id uuid references cards(id) on delete set null,
  action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_batches_user_created_idx on import_batches(user_id, created_at desc);
create index if not exists import_items_batch_position_idx on import_items(batch_id, position);
create index if not exists import_items_user_classification_idx on import_items(user_id, classification);

alter table import_batches enable row level security;
alter table import_items enable row level security;

do $$ begin
  create policy "owner access import batches" on import_batches
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner access import items" on import_items
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function increment_card_quantity(p_card_id uuid, p_user_id uuid)
returns int
language plpgsql
security invoker
as $$
declare new_quantity int;
begin
  update cards
     set quantity = coalesce(quantity, 1) + 1
   where id = p_card_id and user_id = p_user_id
   returning quantity into new_quantity;
  if new_quantity is null then raise exception 'card_not_found'; end if;
  return new_quantity;
end;
$$;

