-- Stride Trade Zone foundation: auth profiles, broker isolation, paper trading,
-- deterministic risk decisions, AI runs, reports, and append-only audit records.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique check (length(firebase_uid) between 1 and 128),
  email text not null,
  name text not null default '',
  phone text not null default '',
  is_super_admin boolean not null default false,
  trial_start_at timestamptz not null default now(),
  trial_end_at timestamptz not null default (now() + interval '3 days'),
  is_trial_active boolean not null default true,
  subscription_status text not null default 'trial' check (subscription_status in ('trial', 'active', 'expired', 'cancelled')),
  subscription_plan text,
  subscription_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  broker text not null default 'kite' check (broker = 'kite'),
  api_key_cipher text not null,
  api_secret_cipher text not null,
  access_token_cipher text,
  broker_user_id text,
  token_expires_at timestamptz,
  status text not null default 'credentials_saved' check (status in ('credentials_saved', 'connected', 'disconnected', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, broker)
);

create table if not exists public.instruments (
  instrument_key text primary key,
  instrument_token bigint not null,
  exchange_token bigint,
  exchange text not null,
  tradingsymbol text not null,
  name text,
  last_price numeric(18,4),
  expiry date,
  strike numeric(18,4),
  tick_size numeric(18,4),
  lot_size integer,
  instrument_type text,
  segment text,
  is_active boolean not null default true,
  refreshed_at timestamptz not null default now()
);

create index if not exists instruments_symbol_idx on public.instruments (tradingsymbol);
create index if not exists instruments_name_idx on public.instruments (name);
create index if not exists instruments_expiry_idx on public.instruments (expiry);
create index if not exists instruments_token_idx on public.instruments (instrument_token);
create index if not exists instruments_active_symbol_idx on public.instruments (is_active, tradingsymbol);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  instrument_key text not null references public.instruments(instrument_key) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (watchlist_id, instrument_key)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  environment text not null check (environment in ('live', 'paper')),
  idempotency_key text not null,
  broker_order_id text,
  instrument_key text not null,
  tradingsymbol text not null,
  exchange text not null,
  side text not null check (side in ('BUY', 'SELL')),
  quantity integer not null check (quantity > 0),
  order_type text not null,
  product text not null,
  variety text not null,
  requested_price numeric(18,4),
  average_price numeric(18,4),
  status text not null,
  status_message text,
  source text not null check (source in ('manual', 'algo', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_broker_order_idx on public.orders (broker_order_id);

create table if not exists public.paper_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  virtual_balance numeric(18,2) not null default 1000000 check (virtual_balance > 0),
  realised_daily_pnl numeric(18,2) not null default 0,
  pnl_session_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  utilised_capital numeric(18,2) not null default 0 check (utilised_capital >= 0),
  risk_per_trade_percent numeric(6,3) not null default 0.5 check (risk_per_trade_percent > 0 and risk_per_trade_percent <= 1),
  daily_loss_percent numeric(6,3) not null default 2 check (daily_loss_percent > 0 and daily_loss_percent <= 3),
  max_positions integer not null default 5 check (max_positions between 1 and 10),
  max_utilisation_percent numeric(6,3) not null default 100 check (max_utilisation_percent > 0 and max_utilisation_percent <= 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  intent_key text not null,
  instrument_key text not null,
  side text not null check (side in ('BUY', 'SELL')),
  quantity integer not null check (quantity > 0),
  requested_price numeric(18,4) not null check (requested_price > 0),
  status text not null check (status in ('pending', 'partially_filled', 'filled', 'rejected', 'cancelled')),
  source text not null check (source in ('algo', 'ai')),
  thesis text not null,
  invalidation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, intent_key)
);

create table if not exists public.paper_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  paper_order_id uuid not null references public.paper_orders(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  price numeric(18,4) not null check (price > 0),
  fees numeric(18,2) not null default 0 check (fees >= 0),
  quote_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  instrument_key text not null,
  quantity integer not null default 0,
  average_price numeric(18,4) not null default 0,
  realised_pnl numeric(18,2) not null default 0,
  unrealised_pnl numeric(18,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, instrument_key)
);

create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  environment text not null default 'paper' check (environment = 'paper'),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  version integer not null check (version > 0),
  definition jsonb not null,
  created_at timestamptz not null default now(),
  unique (strategy_id, version)
);

create table if not exists public.strategy_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  strategy_version_id uuid not null references public.strategy_versions(id) on delete cascade,
  trading_date date not null,
  status text not null check (status in ('evaluating', 'filled', 'rejected', 'failed')),
  intent_key text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strategy_version_id, trading_date)
);

create index if not exists strategy_executions_user_date_idx on public.strategy_executions (user_id, trading_date desc);

create table if not exists public.research_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  instrument_key text,
  title text not null,
  summary text not null,
  source_url text,
  observed_at timestamptz not null,
  payload_hash text,
  created_at timestamptz not null default now()
);

create index if not exists research_evidence_user_observed_idx on public.research_evidence (user_id, observed_at desc);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phase text not null check (phase in ('morning_research', 'open_revalidation', 'daily_report')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'no_trade')),
  model text,
  summary text,
  intent_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ai_run_id uuid not null references public.ai_runs(id) on delete cascade,
  version integer not null,
  hypothesis text not null,
  confidence numeric(6,3) not null check (confidence between 0 and 100),
  invalidation text not null,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (ai_run_id, version)
);

create table if not exists public.risk_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  intent_key text not null,
  approved boolean not null,
  reason_codes text[] not null default '{}',
  calculated_risk_percent numeric(10,5) not null,
  calculated_utilisation_percent numeric(10,5) not null,
  intent jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, intent_key)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  -- Deliberately not a foreign key: deleting an account must retain its immutable audit history.
  user_id uuid not null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null,
  summary text not null,
  planned_trades integer not null default 0,
  accepted_trades integer not null default 0,
  rejected_trades integer not null default 0,
  realised_pnl numeric(18,2) not null default 0,
  fees numeric(18,2) not null default 0,
  confidence numeric(6,3) not null default 0 check (confidence between 0 and 100),
  lessons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_report_id uuid references public.daily_reports(id) on delete cascade,
  channel text not null check (channel in ('email', 'in_app')),
  status text not null check (status in ('queued', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_report_id, channel)
);

create or replace function public.record_paper_fill(
  p_user_id uuid,
  p_intent_key text,
  p_instrument_key text,
  p_side text,
  p_quantity integer,
  p_fill_price numeric,
  p_fees numeric,
  p_quote_timestamp timestamptz,
  p_thesis text,
  p_invalidation text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_old_quantity integer := 0;
  v_old_average numeric := 0;
  v_new_quantity integer;
  v_new_average numeric;
  v_delta integer;
  v_closed_quantity integer := 0;
  v_realised numeric := 0;
  v_existing_realised numeric := 0;
  v_utilised numeric := 0;
begin
  if p_source not in ('ai', 'algo') then raise exception 'Invalid paper order source'; end if;
  update public.paper_accounts set
    realised_daily_pnl = case
      when pnl_session_date = (now() at time zone 'Asia/Kolkata')::date then realised_daily_pnl
      else 0
    end,
    pnl_session_date = (now() at time zone 'Asia/Kolkata')::date
  where user_id = p_user_id;
  if not found then raise exception 'Paper account is not initialized'; end if;

  select quantity, average_price, realised_pnl
    into v_old_quantity, v_old_average, v_existing_realised
    from public.paper_positions
    where user_id = p_user_id and instrument_key = p_instrument_key
    for update;
  if not found then
    v_old_quantity := 0;
    v_old_average := 0;
    v_existing_realised := 0;
  end if;

  v_delta := case when p_side = 'BUY' then p_quantity else -p_quantity end;
  v_new_quantity := v_old_quantity + v_delta;
  if v_old_quantity = 0 or sign(v_old_quantity) = sign(v_delta) then
    v_new_average := ((abs(v_old_quantity) * v_old_average) + (abs(v_delta) * p_fill_price)) / nullif(abs(v_new_quantity), 0);
  else
    v_closed_quantity := least(abs(v_old_quantity), abs(v_delta));
    v_realised := (p_fill_price - v_old_average) * v_closed_quantity * sign(v_old_quantity);
    v_new_average := case
      when v_new_quantity = 0 then 0
      when sign(v_new_quantity) <> sign(v_old_quantity) then p_fill_price
      else v_old_average
    end;
  end if;

  insert into public.paper_orders (
    user_id, intent_key, instrument_key, side, quantity, requested_price,
    status, source, thesis, invalidation
  ) values (
    p_user_id, p_intent_key, p_instrument_key, p_side, p_quantity, p_fill_price,
    'filled', p_source, p_thesis, p_invalidation
  ) returning id into v_order_id;

  insert into public.paper_fills (user_id, paper_order_id, quantity, price, fees, quote_timestamp)
  values (p_user_id, v_order_id, p_quantity, p_fill_price, p_fees, p_quote_timestamp);

  insert into public.paper_positions (
    user_id, instrument_key, quantity, average_price, realised_pnl, unrealised_pnl,
    status, opened_at, closed_at
  ) values (
    p_user_id, p_instrument_key, v_new_quantity, coalesce(v_new_average, 0),
    v_existing_realised + v_realised, 0,
    case when v_new_quantity = 0 then 'closed' else 'open' end,
    now(), case when v_new_quantity = 0 then now() else null end
  )
  on conflict (user_id, instrument_key) do update set
    quantity = excluded.quantity,
    average_price = excluded.average_price,
    realised_pnl = excluded.realised_pnl,
    unrealised_pnl = 0,
    status = excluded.status,
    closed_at = excluded.closed_at;

  select coalesce(sum(abs(quantity) * average_price), 0)
    into v_utilised
    from public.paper_positions
    where user_id = p_user_id and quantity <> 0;

  update public.paper_accounts set
    realised_daily_pnl = realised_daily_pnl + v_realised,
    utilised_capital = v_utilised
  where user_id = p_user_id;

  return v_order_id;
end;
$$;

revoke all on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) to service_role;

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

revoke all on function public.resolve_firebase_profile(text,text,text,text,timestamptz,timestamptz,boolean,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.resolve_firebase_profile(text,text,text,text,timestamptz,timestamptz,boolean,text,text,timestamptz,boolean) to service_role;

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update before update or delete on public.audit_events
for each row execute function public.prevent_audit_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles','broker_connections','watchlists','orders','paper_accounts','paper_orders','paper_positions','strategies','strategy_executions','daily_reports','notification_deliveries']
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.broker_connections enable row level security;
alter table public.instruments enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.orders enable row level security;
alter table public.paper_accounts enable row level security;
alter table public.paper_orders enable row level security;
alter table public.paper_fills enable row level security;
alter table public.paper_positions enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_versions enable row level security;
alter table public.strategy_executions enable row level security;
alter table public.research_evidence enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_plans enable row level security;
alter table public.risk_decisions enable row level security;
alter table public.audit_events enable row level security;
alter table public.daily_reports enable row level security;
alter table public.notification_deliveries enable row level security;

-- Firebase is the sole client identity provider. Browser roles never query the
-- Supabase data plane directly; the verified worker uses service_role instead.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- Restore only the two worker RPCs after the schema-wide browser-role lockdown.
grant execute on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) to service_role;
grant execute on function public.resolve_firebase_profile(text,text,text,text,timestamptz,timestamptz,boolean,text,text,timestamptz,boolean) to service_role;
