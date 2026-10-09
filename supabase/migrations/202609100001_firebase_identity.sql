-- Firebase identity hardening for already-initialized V2 databases. Firebase
-- remains the sole browser identity provider; Supabase UUIDs are internal only.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists firebase_uid text;

create unique index if not exists profiles_firebase_uid_uidx
  on public.profiles (firebase_uid);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_firebase_uid_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    -- NOT VALID preserves any never-deployed Supabase-auth rows for explicit
    -- operator reconciliation while enforcing Firebase identity on new writes.
    alter table public.profiles add constraint profiles_firebase_uid_format
      check (firebase_uid is not null and length(firebase_uid) between 1 and 128)
      not valid;
  end if;
end $$;

-- Audit rows deliberately outlive profile deletion. Removing the cascading
-- foreign key also avoids conflict with the append-only mutation trigger.
alter table public.audit_events drop constraint if exists audit_events_user_id_fkey;
comment on column public.audit_events.user_id is
  'Immutable historical internal profile UUID; intentionally retained without a foreign key after account deletion.';

drop policy if exists profiles_read_own on public.profiles;
drop policy if exists watchlists_manage_own on public.watchlists;
drop policy if exists watchlist_items_manage_own on public.watchlist_items;
drop policy if exists orders_read_own on public.orders;
drop policy if exists paper_accounts_read_own on public.paper_accounts;
drop policy if exists paper_orders_read_own on public.paper_orders;
drop policy if exists paper_fills_read_own on public.paper_fills;
drop policy if exists paper_positions_read_own on public.paper_positions;
drop policy if exists strategies_read_own on public.strategies;
drop policy if exists strategy_versions_read_own on public.strategy_versions;
drop policy if exists strategy_executions_read_own on public.strategy_executions;
drop policy if exists research_evidence_read_own on public.research_evidence;
drop policy if exists ai_runs_read_own on public.ai_runs;
drop policy if exists ai_plans_read_own on public.ai_plans;
drop policy if exists risk_decisions_read_own on public.risk_decisions;
drop policy if exists audit_events_read_own on public.audit_events;
drop policy if exists daily_reports_read_own on public.daily_reports;
drop policy if exists notification_deliveries_read_own on public.notification_deliveries;

create or replace function public.resolve_firebase_profile(
  p_firebase_uid text,
  p_email text,
  p_name text,
  p_phone text,
  p_trial_start_at timestamptz,
  p_trial_end_at timestamptz,
  p_is_trial_active boolean,
  p_subscription_status text,
  p_subscription_plan text,
  p_subscription_end_at timestamptz,
  p_is_super_admin boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_firebase_uid is null or length(p_firebase_uid) not between 1 and 128 then
    raise exception 'Invalid Firebase UID';
  end if;
  if p_subscription_status not in ('trial', 'active', 'expired', 'cancelled') then
    raise exception 'Invalid subscription status';
  end if;

  insert into public.profiles (
    firebase_uid, email, name, phone, is_super_admin, trial_start_at,
    trial_end_at, is_trial_active, subscription_status, subscription_plan,
    subscription_end_at
  )
  values (
    p_firebase_uid, coalesce(p_email, ''), coalesce(p_name, ''),
    coalesce(p_phone, ''), coalesce(p_is_super_admin, false),
    coalesce(p_trial_start_at, now()), coalesce(p_trial_end_at, 'epoch'::timestamptz),
    coalesce(p_is_trial_active, false), p_subscription_status,
    p_subscription_plan, p_subscription_end_at
  )
  on conflict (firebase_uid) do update set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    is_super_admin = excluded.is_super_admin,
    trial_start_at = excluded.trial_start_at,
    trial_end_at = excluded.trial_end_at,
    is_trial_active = excluded.is_trial_active,
    subscription_status = excluded.subscription_status,
    subscription_plan = excluded.subscription_plan,
    subscription_end_at = excluded.subscription_end_at
  returning id into v_profile_id;

  insert into public.paper_accounts (user_id)
  values (v_profile_id)
  on conflict (user_id) do nothing;

  insert into public.watchlists (user_id, name)
  values (v_profile_id, 'My watchlist')
  on conflict (user_id, name) do nothing;

  return v_profile_id;
end;
$$;

-- Browser roles receive no database-plane capability. The Firebase-verified
-- worker alone uses the service-role client and the two explicit RPCs.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on function public.resolve_firebase_profile(text,text,text,text,timestamptz,timestamptz,boolean,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.resolve_firebase_profile(text,text,text,text,timestamptz,timestamptz,boolean,text,text,timestamptz,boolean) to service_role;
grant execute on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) to service_role;
