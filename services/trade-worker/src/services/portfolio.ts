/**
 * User-isolated live and paper portfolio projection services.
 * @module services/portfolio
 */

import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getAuthenticatedKiteClient, getBrokerStatus } from './broker.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'
import { getIndiaTradingDate, getIndiaTradingDayStart, resolveDailyRealisedPnl } from './trading-session.js'

/**
 * Normalizes a Kite holding into the browser portfolio contract.
 */
function normalizeHolding(holding: Record<string, unknown>) {
  const quantity = Number(holding.quantity || 0)
  const average = Number(holding.average_price || 0)
  const ltp = Number(holding.last_price || 0)
  const pnl = Number(holding.pnl ?? (ltp - average) * quantity)
  return {
    instrumentKey: `${String(holding.exchange || '')}:${String(holding.tradingsymbol || '')}`,
    symbol: String(holding.tradingsymbol || ''),
    exchange: String(holding.exchange || ''),
    instrumentToken: Number(holding.instrument_token || 0),
    quantity,
    average,
    ltp,
    pnl,
  }
}

/**
 * Normalizes a Kite order into the browser order-book contract.
 */
function normalizeOrder(order: Record<string, unknown>) {
  return {
    id: String(order.order_id || ''),
    time: String(order.order_timestamp || order.exchange_timestamp || ''),
    symbol: String(order.tradingsymbol || ''),
    exchange: String(order.exchange || ''),
    side: String(order.transaction_type || ''),
    quantity: Number(order.quantity || 0),
    type: String(order.order_type || ''),
    price: Number(order.average_price || order.price || 0),
    status: String(order.status || ''),
    source: 'Manual',
  }
}

/**
 * Loads a user-isolated live portfolio overview directly from Kite.
 */
export async function getPortfolioOverview(supabase: SupabaseAdmin, config: WorkerConfig, userId: string) {
  const connection = await getBrokerStatus(supabase, userId)
  if (connection.status !== 'connected') {
    return {
      mode: 'live',
      environment: 'live',
      connection,
      funds: { available: 0, used: 0, opening: 0, equity: 0, virtual: false },
      pnl: { day: 0, realised: 0, unrealised: 0, fees: 0 },
      watchlist: [],
      holdings: [],
      orders: [],
      report: await getLatestReport(supabase, userId),
      auditEvents: await getLatestAuditEvents(supabase, userId),
    }
  }
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const [rawHoldings, rawPositions, rawMargins, rawOrders, watchlistResult] = await Promise.all([
    kite.getHoldings(),
    kite.getPositions(),
    kite.getMargins(),
    kite.getOrders(),
    supabase
      .from('watchlist_items')
      .select('instrument_key,sort_order,instruments!inner(instrument_token,exchange,tradingsymbol)')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true }),
  ])
  if (watchlistResult.error) throw watchlistResult.error
  const holdings = (rawHoldings as unknown as Array<Record<string, unknown>>).map(normalizeHolding)
  const positions = ((rawPositions as unknown as { net?: Array<Record<string, unknown>> }).net || [])
  const orders = (rawOrders as unknown as Array<Record<string, unknown>>).map(normalizeOrder)
  const equity = (rawMargins as unknown as { equity?: Record<string, unknown> }).equity || {}
  const available = equity.available as Record<string, unknown> | undefined
  const utilised = equity.utilised as Record<string, unknown> | undefined
  const dayPnl = positions.reduce((total, position) => total + Number(position.pnl || position.m2m || 0), 0)
  const realised = positions.reduce((total, position) => total + Number(position.realised || 0), 0)
  const unrealised = positions.reduce((total, position) => total + Number(position.unrealised || 0), 0)
  const storedItems = (watchlistResult.data || []) as unknown as Array<{
    instrument_key: string
    instruments: { instrument_token: number; exchange: string; tradingsymbol: string }
  }>
  const requestedKeys = storedItems.map((item) => item.instrument_key)
  const liveQuotes = requestedKeys.length ? await kite.getLTP(requestedKeys) : {}
  const storedWatchlist = storedItems.map((item) => ({
    instrumentKey: item.instrument_key,
    instrumentToken: Number(liveQuotes[item.instrument_key]?.instrument_token || item.instruments.instrument_token),
    symbol: item.instruments.tradingsymbol,
    exchange: item.instruments.exchange,
    price: Number(liveQuotes[item.instrument_key]?.last_price || 0),
    change: 0,
  }))
  const fallbackWatchlist = holdings.slice(0, 20).map((holding) => ({
    instrumentKey: `${holding.exchange}:${holding.symbol}`,
    instrumentToken: holding.instrumentToken,
    symbol: holding.symbol,
    exchange: holding.exchange,
    price: holding.ltp,
    change: holding.average ? Number((((holding.ltp - holding.average) / holding.average) * 100).toFixed(2)) : 0,
  }))
  const watchlist = storedWatchlist.length ? storedWatchlist : fallbackWatchlist
  return {
    mode: 'live',
    environment: 'live',
    connection,
    funds: {
      available: Number(available?.live_balance || available?.cash || equity.net || 0),
      used: Number(utilised?.debits || 0),
      opening: Number(available?.opening_balance || 0),
      equity: Number(equity.net || 0),
      virtual: false,
    },
    pnl: { day: dayPnl, realised, unrealised, fees: 0 },
    watchlist,
    holdings,
    orders,
    report: await getLatestReport(supabase, userId),
    auditEvents: await getLatestAuditEvents(supabase, userId),
  }
}

/**
 * Loads the isolated paper account while marking its positions from current Kite prices when available.
 */
export async function getPaperPortfolioOverview(supabase: SupabaseAdmin, config: WorkerConfig, userId: string) {
  const connection = await getBrokerStatus(supabase, userId)
  const reportDate = getIndiaTradingDate()
  const dayStart = getIndiaTradingDayStart(reportDate)
  const [accountResult, positionsResult, ordersResult, watchlistResult, feesResult] = await Promise.all([
    supabase.from('paper_accounts').select('virtual_balance,realised_daily_pnl,lifetime_realised_pnl,total_fees,utilised_capital,pnl_session_date').eq('user_id', userId).single(),
    supabase.from('paper_positions').select('instrument_key,quantity,average_price,realised_pnl,status').eq('user_id', userId).neq('quantity', 0),
    supabase.from('paper_orders').select('id,instrument_key,side,quantity,requested_price,status,source,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('watchlist_items').select('instrument_key,sort_order').eq('user_id', userId).order('sort_order', { ascending: true }),
    supabase.from('paper_fills').select('fees').eq('user_id', userId).gte('created_at', dayStart),
  ])
  if (accountResult.error) throw accountResult.error
  if (positionsResult.error) throw positionsResult.error
  if (ordersResult.error) throw ordersResult.error
  if (watchlistResult.error) throw watchlistResult.error
  if (feesResult.error) throw feesResult.error

  const positions = positionsResult.data || []
  const watchlistKeys = (watchlistResult.data || []).map((item) => item.instrument_key)
  const instrumentKeys = Array.from(new Set([...watchlistKeys, ...positions.map((position) => position.instrument_key)]))
  const { data: metadata, error: metadataError } = instrumentKeys.length
    ? await supabase.from('instruments').select('instrument_key,instrument_token,exchange,tradingsymbol').in('instrument_key', instrumentKeys)
    : { data: [], error: null }
  if (metadataError) throw metadataError
  const metadataByKey = new Map((metadata || []).map((instrument) => [instrument.instrument_key, instrument]))
  let quotes: Record<string, { instrument_token: number; last_price: number }> = {}
  if (connection.status === 'connected' && instrumentKeys.length) {
    const { market } = await getAuthenticatedMarketDataClient(supabase, config, userId)
    quotes = await market.getLTP(instrumentKeys)
  }

  const paperHoldings = positions.map((position) => {
    const instrument = metadataByKey.get(position.instrument_key)
    const ltp = Number(quotes[position.instrument_key]?.last_price || position.average_price)
    const quantity = Number(position.quantity)
    const average = Number(position.average_price)
    return {
      instrumentKey: position.instrument_key,
      symbol: instrument?.tradingsymbol || position.instrument_key.split(':').slice(1).join(':'),
      exchange: instrument?.exchange || position.instrument_key.split(':')[0],
      instrumentToken: Number(quotes[position.instrument_key]?.instrument_token || instrument?.instrument_token || 0),
      quantity,
      average,
      ltp,
      pnl: Number(((ltp - average) * quantity).toFixed(2)),
    }
  })
  const effectiveWatchlistKeys = watchlistKeys.length ? watchlistKeys : positions.map((position) => position.instrument_key)
  const watchlist = effectiveWatchlistKeys.map((instrumentKey) => {
    const instrument = metadataByKey.get(instrumentKey)
    return {
      instrumentKey,
      instrumentToken: Number(quotes[instrumentKey]?.instrument_token || instrument?.instrument_token || 0),
      symbol: instrument?.tradingsymbol || instrumentKey.split(':').slice(1).join(':'),
      exchange: instrument?.exchange || instrumentKey.split(':')[0],
      price: Number(quotes[instrumentKey]?.last_price || positions.find((position) => position.instrument_key === instrumentKey)?.average_price || 0),
      change: 0,
    }
  })
  const fees = (feesResult.data || []).reduce((total, fill) => total + Number(fill.fees || 0), 0)
  const realised = resolveDailyRealisedPnl(accountResult.data, reportDate)
  const opening = Number(accountResult.data.virtual_balance)
  const lifetimeRealised = Number(accountResult.data.lifetime_realised_pnl || 0)
  const totalFees = Number(accountResult.data.total_fees || 0)
  const used = Number(accountResult.data.utilised_capital)
  const unrealised = paperHoldings.reduce((total, holding) => total + holding.pnl, 0)
  return {
    mode: 'paper',
    environment: 'paper',
    connection,
    funds: {
      available: Math.max(0, opening + lifetimeRealised - totalFees - used),
      used,
      opening,
      equity: opening + lifetimeRealised - totalFees + unrealised,
      virtual: true,
    },
    pnl: { day: realised - fees + unrealised, realised, unrealised, fees },
    watchlist,
    holdings: paperHoldings,
    orders: (ordersResult.data || []).map((order) => ({
      id: order.id,
      time: order.created_at,
      symbol: metadataByKey.get(order.instrument_key)?.tradingsymbol || order.instrument_key,
      exchange: metadataByKey.get(order.instrument_key)?.exchange || order.instrument_key.split(':')[0],
      side: order.side,
      quantity: Number(order.quantity),
      type: 'PAPER',
      price: Number(order.requested_price),
      status: order.status,
      source: order.source === 'ai' ? 'AI paper' : 'Algo paper',
    })),
    report: await getLatestReport(supabase, userId),
    auditEvents: await getLatestAuditEvents(supabase, userId),
  }
}

/**
 * Returns the caller's recent append-only system decisions for the Logs workspace.
 */
async function getLatestAuditEvents(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase.from('audit_events').select('id,event_type,summary,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data || []).map((event) => ({ id: event.id, type: event.event_type, summary: event.summary, createdAt: event.created_at }))
}

/**
 * Returns the most recent stored AI daily report or an empty explanatory contract.
 */
async function getLatestReport(supabase: SupabaseAdmin, userId: string) {
  const { data } = await supabase.from('daily_reports').select('*').eq('user_id', userId).order('report_date', { ascending: false }).limit(1).maybeSingle()
  return data ? {
    date: data.report_date,
    thesis: data.summary,
    plannedTrades: data.planned_trades,
    acceptedTrades: data.accepted_trades,
    rejectedTrades: data.rejected_trades,
    realisedPnl: data.realised_pnl,
    fees: data.fees,
    confidence: data.confidence,
    lessons: data.lessons || [],
  } : {
    date: new Date().toISOString().slice(0, 10),
    thesis: 'No AI report has been generated for this account yet.',
    plannedTrades: 0,
    acceptedTrades: 0,
    rejectedTrades: 0,
    realisedPnl: 0,
    fees: 0,
    confidence: 0,
    lessons: [],
  }
}

/**
 * Retrieves normalized historical candles for one indexed Kite instrument.
 */
export async function getHistoricalCandles(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  userId: string,
  instrumentKey: string,
  interval: string,
) {
  const { data: instrument, error } = await supabase.from('instruments').select('instrument_token').eq('instrument_key', instrumentKey).eq('is_active', true).maybeSingle()
  if (error) throw error
  if (!instrument) throw new Error('Instrument is not present in the current master.')
  const { market } = await getAuthenticatedMarketDataClient(supabase, config, userId)
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 86400000)
  const intervalMap: Record<string, 'minute' | '5minute' | '15minute' | '60minute' | 'day'> = { '1m': 'minute', '5m': '5minute', '15m': '15minute', '1h': '60minute', '1D': 'day' }
  const candles = await market.getHistoricalData(Number(instrument.instrument_token), intervalMap[interval] || '15minute', from, to)
  return (candles as unknown as Array<Record<string, unknown>>).map((candle) => ({
    time: Math.floor(new Date(String(candle.date)).getTime() / 1000),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume || 0),
    oi: Number(candle.oi || 0),
  }))
}
