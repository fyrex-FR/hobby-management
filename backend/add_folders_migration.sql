-- Dossiers personnalisés (multi-étiquettes) : une carte peut appartenir à plusieurs dossiers.
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  emoji text,
  position int default 0,
  created_at timestamptz default now()
);

-- RLS : chaque utilisateur ne voit que ses propres dossiers (le backend, en clé service role, contourne la RLS).
alter table folders enable row level security;

create policy "owner access" on folders
    for all using (auth.uid() = user_id);

-- Liens dossiers <-> carte stockés en tableau sur la carte (filtrage en mémoire côté app).
alter table cards add column if not exists folder_ids uuid[] default '{}';
