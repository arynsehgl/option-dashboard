-- One-time Kite OAuth state and paper-first release guards.

create table if not exists public.broker_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null unique check (length(state_hash) = 64),
  return_origin text not null check (length(return_origin) between 8 and 512),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists broker_oauth_states_expiry_idx
  on public.broker_oauth_states (expires_at);

alter table public.broker_oauth_states enable row level security;
revoke all privileges on public.broker_oauth_states from public, anon, authenticated;

create or replace function public.consume_broker_oauth_state(p_state_hash text)
returns table(profile_id uuid, redirect_origin text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.broker_oauth_states as oauth_state
  set consumed_at = now()
  where oauth_state.state_hash = p_state_hash
    and oauth_state.consumed_at is null
    and oauth_state.expires_at > now()
  returning oauth_state.user_id, oauth_state.return_origin;
end;
$$;

revoke all on function public.consume_broker_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_broker_oauth_state(text) to service_role;

-- A database copied from a development environment cannot retain an active
-- strategy while the V2 UI and API intentionally expose draft-only behavior.
update public.strategies set status = 'paused' where status = 'active';
