-- Demandes d'intérêt envoyées par les visiteurs d'une collection partagée.
create table if not exists share_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  share_token text,
  viewer_handle text not null,
  message text,
  card_ids uuid[] default '{}',
  status text default 'new',          -- new | contacted | archived
  created_at timestamptz default now()
);

-- RLS : seul le propriétaire voit ses demandes (le backend public écrit en clé service role).
alter table share_requests enable row level security;

create policy "owner access" on share_requests
    for all using (auth.uid() = user_id);
