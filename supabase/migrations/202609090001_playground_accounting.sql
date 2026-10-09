-- Stride Playground hardening: persistent ₹10 lakh accounts, transactional
-- buying-power enforcement, cumulative fees/P&L, and live-only broker records.

alter table public.paper_accounts
  add column if not exists lifetime_realised_pnl numeric(18,2) not null default 0,
  add column if not exists total_fees numeric(18,2) not null default 0;

insert into public.paper_accounts (user_id, virtual_balance)
select id, 1000000 from public.profiles
on conflict (user_id) do nothing;

comment on column public.paper_accounts.virtual_balance is
  'Immutable opening Playground capital. New users start with INR 10,00,000.';
comment on column public.paper_accounts.lifetime_realised_pnl is
  'Cumulative realised paper P&L retained across trading days.';
comment on column public.paper_accounts.total_fees is
  'Cumulative simulated charges retained across trading days.';

do $$
begin
  if exists (select 1 from public.orders where environment <> 'live') then
    raise exception 'Cannot enforce live-only broker orders while non-live rows exist in public.orders';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_live_execution_only'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_live_execution_only check (environment = 'live');
  end if;
end $$;

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
  if p_source not in ('ai', 'algo') then raise exception 'Invalid paper order source'; end if;
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
  if v_utilised > greatest(v_capital_ceiling, 0) then
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

  return v_order_id;
end;
$$;

revoke all on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text) to service_role;
