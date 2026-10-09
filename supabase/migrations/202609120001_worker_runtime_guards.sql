-- Forward-only production guards for active AI work and all persisted paper fills.

-- Raw AI-run capabilities remain worker-memory only. Existing active rows are
-- invalidated during this migration because no running process can possess the
-- newly generated replacement lease.
alter table public.ai_runs
  add column if not exists lease_token_hash text default encode(gen_random_bytes(32), 'hex');

update public.ai_runs
set
  status = 'failed',
  completed_at = coalesce(completed_at, now()),
  error = coalesce(error, 'Invalidated while enabling durable AI-run fencing.'),
  lease_token_hash = encode(gen_random_bytes(32), 'hex')
where status in ('queued', 'running');

update public.ai_runs
set lease_token_hash = encode(gen_random_bytes(32), 'hex')
where lease_token_hash is null;

alter table public.ai_runs alter column lease_token_hash set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_runs_lease_token_hash_length'
      and conrelid = 'public.ai_runs'::regclass
  ) then
    alter table public.ai_runs
      add constraint ai_runs_lease_token_hash_length check (length(lease_token_hash) = 64);
  end if;
end $$;

-- Retain the newest pre-existing active run per user so the uniqueness index can
-- be applied safely if a database already introduced leases independently.
with ranked_active_runs as (
  select
    id,
    row_number() over (
      partition by user_id
      order by started_at desc, created_at desc, id desc
    ) as active_rank
  from public.ai_runs
  where status in ('queued', 'running')
)
update public.ai_runs as ai_run
set
  status = 'failed',
  completed_at = coalesce(ai_run.completed_at, now()),
  error = coalesce(ai_run.error, 'Superseded while enforcing one active AI run per user.'),
  lease_token_hash = encode(gen_random_bytes(32), 'hex')
from ranked_active_runs
where ai_run.id = ranked_active_runs.id
  and ranked_active_runs.active_rank > 1;

create unique index if not exists ai_runs_one_active_per_user_idx
  on public.ai_runs (user_id)
  where status in ('queued', 'running');

-- This trigger is the final central boundary beneath every worker code path,
-- including mandatory position flattening. Application code must pass the
-- timestamp received in Kite's quote packet; the database independently checks
-- session time and timestamp freshness before any fill-side mutations commit.
create or replace function public.enforce_paper_fill_market_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_market_now timestamp := v_now at time zone 'Asia/Kolkata';
  v_order_source text;
begin
  select source into v_order_source
    from public.paper_orders
    where id = new.paper_order_id and user_id = new.user_id;
  if not found then raise exception 'Paper fill has no matching user-owned order'; end if;

  if extract(isodow from v_market_now) > 5 then
    raise exception 'Paper fills are allowed only on weekdays';
  end if;

  if v_order_source = 'system' then
    if v_market_now::time < time '15:20:00'
       or v_market_now::time >= time '15:30:00' then
      raise exception 'System position flattening is allowed only from 15:20 through 15:29 IST';
    end if;
  elsif v_market_now::time < time '09:15:00'
        or v_market_now::time >= time '15:20:00' then
    raise exception 'AI paper fills are allowed only from 09:15 through 15:19 IST';
  end if;

  if new.quote_timestamp < v_now - interval '30 seconds'
     or new.quote_timestamp > v_now + interval '5 seconds' then
    raise exception 'Paper fills require a fresh broker quote timestamp';
  end if;

  return new;
end;
$$;

drop trigger if exists paper_fills_market_session_guard on public.paper_fills;
create trigger paper_fills_market_session_guard
before insert on public.paper_fills
for each row execute function public.enforce_paper_fill_market_session();

revoke all on function public.enforce_paper_fill_market_session() from public, anon, authenticated;

-- The safety flatten job is a system source rather than an AI run. Every AI
-- source must provide a matching active run capability to the RPC below.
alter table public.paper_orders drop constraint if exists paper_orders_source_check;
alter table public.paper_orders
  add constraint paper_orders_source_check check (source in ('algo', 'ai', 'system'));

drop function if exists public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text);

create function public.record_paper_fill(
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
  p_source text,
  p_ai_run_id uuid,
  p_ai_run_lease text,
  p_risk_decision jsonb
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
  v_new_average numeric := 0;
  v_delta integer;
  v_closed_quantity integer := 0;
  v_realised numeric := 0;
  v_existing_realised numeric := 0;
  v_utilised numeric := 0;
  v_opening_capital numeric := 0;
  v_lifetime_realised numeric := 0;
  v_total_fees numeric := 0;
  v_capital_ceiling numeric := 0;
begin
  if p_source = 'ai' then
    if p_ai_run_id is null
       or p_ai_run_lease is null
       or length(p_ai_run_lease) < 32
       or length(p_ai_run_lease) > 128 then
      raise exception 'AI paper fills require a valid active run lease';
    end if;

    perform 1
      from public.ai_runs as ai_run
      where ai_run.id = p_ai_run_id
        and ai_run.user_id = p_user_id
        and ai_run.status in ('queued', 'running')
        and ai_run.lease_token_hash = encode(digest(p_ai_run_lease, 'sha256'), 'hex')
      for update;
    if not found then raise exception 'AI run lease is no longer active'; end if;
    if p_risk_decision is null
       or jsonb_typeof(p_risk_decision) <> 'object'
       or coalesce((p_risk_decision->>'approved')::boolean, false) is not true then
      raise exception 'AI paper fills require an approved risk decision';
    end if;

    insert into public.risk_decisions (
      user_id, intent_key, approved, reason_codes,
      calculated_risk_percent, calculated_utilisation_percent, intent
    ) values (
      p_user_id,
      p_intent_key,
      true,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_risk_decision->'reasonCodes', '[]'::jsonb))), '{}'::text[]),
      coalesce((p_risk_decision->>'calculatedRiskPercent')::numeric, 0),
      coalesce((p_risk_decision->>'calculatedUtilisationPercent')::numeric, 0),
      coalesce(p_risk_decision->'intent', '{}'::jsonb)
    );

    insert into public.audit_events (user_id, event_type, summary, metadata)
    values (
      p_user_id,
      'RISK_DECISION_APPROVED',
      'Paper intent passed deterministic limits.',
      jsonb_build_object('intentKey', p_intent_key, 'reasonCodes', coalesce(p_risk_decision->'reasonCodes', '[]'::jsonb), 'aiRunId', p_ai_run_id)
    );
  elsif p_source = 'system' then
    if p_ai_run_id is not null or p_ai_run_lease is not null or p_risk_decision is not null then
      raise exception 'System paper fills cannot carry AI run data';
    end if;
  else
    raise exception 'Invalid paper order source';
  end if;

  if p_side not in ('BUY', 'SELL') then raise exception 'Invalid paper order side'; end if;
  if p_quantity <= 0 or p_fill_price <= 0 or p_fees < 0 then raise exception 'Invalid paper fill values'; end if;
  if p_quote_timestamp < now() - interval '30 seconds' or p_quote_timestamp > now() + interval '5 seconds' then
    raise exception 'Paper fills require a fresh market-data timestamp';
  end if;

  update public.paper_accounts set
    realised_daily_pnl = case
      when pnl_session_date = (now() at time zone 'Asia/Kolkata')::date then realised_daily_pnl
      else 0
    end,
    pnl_session_date = (now() at time zone 'Asia/Kolkata')::date
  where user_id = p_user_id
  returning virtual_balance, lifetime_realised_pnl, total_fees
    into v_opening_capital, v_lifetime_realised, v_total_fees;
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

  if p_source = 'system' and (
    v_old_quantity = 0
    or p_quantity <> abs(v_old_quantity)
    or (v_old_quantity > 0 and p_side <> 'SELL')
    or (v_old_quantity < 0 and p_side <> 'BUY')
  ) then
    raise exception 'System paper fills may only flatten an existing position';
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

  v_capital_ceiling := v_opening_capital + v_lifetime_realised + v_realised - v_total_fees - p_fees;
  if p_source = 'ai' and v_utilised > greatest(v_capital_ceiling, 0) then
    raise exception 'Insufficient virtual capital for paper fill';
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

  update public.paper_accounts set
    realised_daily_pnl = realised_daily_pnl + v_realised,
    lifetime_realised_pnl = lifetime_realised_pnl + v_realised,
    total_fees = total_fees + p_fees,
    utilised_capital = v_utilised
  where user_id = p_user_id;

  if p_source = 'ai' then
    insert into public.audit_events (user_id, event_type, summary, metadata)
    values (
      p_user_id,
      'PAPER_ORDER_FILLED',
      'Approved intent was filled by the paper simulator.',
      jsonb_build_object('intentKey', p_intent_key, 'fillPrice', p_fill_price, 'quantity', p_quantity, 'estimatedFees', p_fees, 'aiRunId', p_ai_run_id)
    );
  else
    insert into public.audit_events (user_id, event_type, summary, metadata)
    values (
      p_user_id,
      'PAPER_POSITION_FLATTENED',
      'Intraday close guard flattened a simulated position at the current Kite quote.',
      jsonb_build_object('intentKey', p_intent_key, 'instrumentKey', p_instrument_key, 'paperOrderId', v_order_id, 'fillPrice', p_fill_price, 'quantity', p_quantity, 'fees', p_fees)
    );
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text,uuid,text,jsonb) to service_role;

-- Rejected decisions are persisted only while their exact AI lease remains
-- active, keeping stale runs out of daily accepted/rejected report counts.
create function public.record_ai_risk_rejection(
  p_user_id uuid,
  p_ai_run_id uuid,
  p_ai_run_lease text,
  p_intent_key text,
  p_reason_codes text[],
  p_calculated_risk_percent numeric,
  p_calculated_utilisation_percent numeric,
  p_intent jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ai_run_lease is null or length(p_ai_run_lease) < 32 or length(p_ai_run_lease) > 128 then
    raise exception 'AI risk decisions require a valid active run lease';
  end if;

  perform 1
    from public.ai_runs as ai_run
    where ai_run.id = p_ai_run_id
      and ai_run.user_id = p_user_id
      and ai_run.status in ('queued', 'running')
      and ai_run.lease_token_hash = encode(digest(p_ai_run_lease, 'sha256'), 'hex')
    for update;
  if not found then raise exception 'AI run lease is no longer active'; end if;

  insert into public.risk_decisions (
    user_id, intent_key, approved, reason_codes,
    calculated_risk_percent, calculated_utilisation_percent, intent
  ) values (
    p_user_id, p_intent_key, false, coalesce(p_reason_codes, '{}'::text[]),
    p_calculated_risk_percent, p_calculated_utilisation_percent, p_intent
  );

  insert into public.audit_events (user_id, event_type, summary, metadata)
  values (
    p_user_id,
    'INTENT_REJECTED',
    'Paper intent was rejected by deterministic limits.',
    jsonb_build_object('intentKey', p_intent_key, 'reasonCodes', to_jsonb(coalesce(p_reason_codes, '{}'::text[])), 'aiRunId', p_ai_run_id)
  );
end;
$$;

revoke all on function public.record_ai_risk_rejection(uuid,uuid,text,text,text[],numeric,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.record_ai_risk_rejection(uuid,uuid,text,text,text[],numeric,numeric,jsonb) to service_role;

-- Plan creation and the terminal transition share the same row lock so stale
-- recovery cannot be overwritten and stale plans cannot enter daily reports.
create function public.finalize_ai_run(
  p_user_id uuid,
  p_ai_run_id uuid,
  p_ai_run_lease text,
  p_status text,
  p_summary text,
  p_intent_count integer,
  p_confidence numeric,
  p_invalidation text,
  p_evidence_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'no_trade') then raise exception 'Invalid AI terminal status'; end if;
  if p_intent_count < 0 then raise exception 'Invalid AI intent count'; end if;
  if p_confidence < 0 or p_confidence > 100 then raise exception 'Invalid AI plan confidence'; end if;
  if p_ai_run_lease is null or length(p_ai_run_lease) < 32 or length(p_ai_run_lease) > 128 then
    raise exception 'AI finalization requires a valid active run lease';
  end if;

  perform 1
    from public.ai_runs as ai_run
    where ai_run.id = p_ai_run_id
      and ai_run.user_id = p_user_id
      and ai_run.status in ('queued', 'running')
      and ai_run.lease_token_hash = encode(digest(p_ai_run_lease, 'sha256'), 'hex')
    for update;
  if not found then raise exception 'AI run lease is no longer active'; end if;

  insert into public.ai_plans (
    user_id, ai_run_id, version, hypothesis, confidence, invalidation, evidence_ids
  ) values (
    p_user_id, p_ai_run_id, 1, p_summary, p_confidence,
    p_invalidation, coalesce(p_evidence_ids, '{}'::uuid[])
  );

  update public.ai_runs
  set
    status = p_status,
    completed_at = now(),
    summary = p_summary,
    intent_count = p_intent_count,
    error = null
  where id = p_ai_run_id;
end;
$$;

revoke all on function public.finalize_ai_run(uuid,uuid,text,text,text,integer,numeric,text,uuid[]) from public, anon, authenticated;
grant execute on function public.finalize_ai_run(uuid,uuid,text,text,text,integer,numeric,text,uuid[]) to service_role;

-- Created last: the worker uses this read-only marker to prove that every
-- runtime guard from this migration exists and remains enabled before serving.
create or replace function public.verify_stride_v2_runtime_guards()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    exists (
      select 1
      from pg_index as index_state
      where index_state.indexrelid = to_regclass('public.ai_runs_one_active_per_user_idx')
        and index_state.indrelid = 'public.ai_runs'::regclass
        and index_state.indisunique
        and index_state.indisvalid
        and index_state.indisready
        and index_state.indnkeyatts = 1
        and pg_get_indexdef(index_state.indexrelid) like '% USING btree (user_id) WHERE %'
        and pg_get_expr(index_state.indpred, index_state.indrelid) = '(status = ANY (ARRAY[''queued''::text, ''running''::text]))'
    )
    and exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.paper_fills'::regclass
        and tgname = 'paper_fills_market_session_guard'
        and not tgisinternal
        and tgenabled <> 'D'
        and tgfoid = to_regprocedure('public.enforce_paper_fill_market_session()')
    )
    and exists (
      select 1
      from pg_attribute
      where attrelid = 'public.ai_runs'::regclass
        and attname = 'lease_token_hash'
        and atttypid = 'text'::regtype
        and attnotnull
        and not attisdropped
    )
    and to_regprocedure('public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text,uuid,text,jsonb)') is not null
    and to_regprocedure('public.record_ai_risk_rejection(uuid,uuid,text,text,text[],numeric,numeric,jsonb)') is not null
    and to_regprocedure('public.finalize_ai_run(uuid,uuid,text,text,text,integer,numeric,text,uuid[])') is not null
    and to_regprocedure('public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text)') is null;
$$;

revoke all on function public.verify_stride_v2_runtime_guards() from public, anon, authenticated;
grant execute on function public.verify_stride_v2_runtime_guards() to service_role;
