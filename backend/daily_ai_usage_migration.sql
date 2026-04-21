create table if not exists public.daily_ai_usage (
  usage_date date primary key,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.get_daily_ai_usage(p_limit integer default 480)
returns jsonb
language sql
as $$
  with today_usage as (
    select
      current_date as usage_date,
      coalesce(
        (select used from public.daily_ai_usage where usage_date = current_date),
        0
      ) as used
  )
  select jsonb_build_object(
    'date', usage_date,
    'used', used,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - used),
    'pct', round((used::numeric / p_limit::numeric) * 100, 1)
  )
  from today_usage;
$$;

create or replace function public.increment_daily_ai_usage(p_limit integer default 480)
returns jsonb
language plpgsql
as $$
declare
  v_used integer;
  v_allowed boolean := false;
begin
  insert into public.daily_ai_usage (usage_date, used, updated_at)
  values (current_date, 1, now())
  on conflict (usage_date) do update
  set
    used = public.daily_ai_usage.used + 1,
    updated_at = now()
  where public.daily_ai_usage.used < p_limit
  returning used into v_used;

  if v_used is not null then
    v_allowed := true;
  else
    select used into v_used
    from public.daily_ai_usage
    where usage_date = current_date;
  end if;

  return jsonb_build_object(
    'date', current_date,
    'used', v_used,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - v_used),
    'pct', round((v_used::numeric / p_limit::numeric) * 100, 1),
    'allowed', v_allowed
  );
end;
$$;
