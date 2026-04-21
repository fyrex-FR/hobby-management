alter table public.cards
add column if not exists is_rookie boolean default false;

update public.cards
set is_rookie = false
where is_rookie is null;
