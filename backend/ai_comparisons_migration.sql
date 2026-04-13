-- Run this in the Supabase SQL editor
create table if not exists ai_comparisons (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null,
    created_at  timestamptz not null default now(),

    -- inputs
    front_url   text,
    back_url    text,

    -- model outputs
    haiku_result    jsonb,
    haiku_latency_ms  int,
    haiku_cost_usd    numeric(10, 6),
    haiku_error     text,

    gemini_result   jsonb,
    gemini_latency_ms int,
    gemini_cost_usd   numeric(10, 6),
    gemini_error    text,

    -- manual scoring (filled later via /compare/{id}/score)
    winner          text check (winner in ('haiku', 'gemini', 'tie', 'both_wrong')),
    correct_fields  text[],   -- e.g. ['player','team','set','parallel']
    notes           text
);

-- RLS: each user sees only their own rows
alter table ai_comparisons enable row level security;

create policy "owner access" on ai_comparisons
    for all using (auth.uid() = user_id);
