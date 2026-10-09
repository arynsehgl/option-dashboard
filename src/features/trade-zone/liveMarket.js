/**
 * Pure helpers for applying authenticated Kite ticks to Trade Zone state.
 * @module features/trade-zone/liveMarket
 */

const intervalSeconds = Object.freeze({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400 })
export const MAX_STREAM_INSTRUMENT_TOKENS = 100

/**
 * Returns the unique positive instrument tokens needed by the visible workspace.
 */
export function collectStreamInstrumentTokens(overview, selectedInstrument) {
  const candidates = [
    ...(selectedInstrument ? [selectedInstrument] : []),
    ...(overview?.watchlist || []),
    ...(overview?.holdings || []),
  ]
  const selectedTokens = []
  const seen = new Set()
  for (const item of candidates) {
    const token = Number(item.instrumentToken)
    if (!Number.isInteger(token) || token <= 0 || seen.has(token)) continue
    seen.add(token)
    selectedTokens.push(token)
    if (selectedTokens.length === MAX_STREAM_INSTRUMENT_TOKENS) break
  }
  return selectedTokens
}

/**
 * Derives a percentage change from a tick without inventing movement.
 */
function tickChangePercent(tick, fallback = 0) {
  if (Number.isFinite(Number(tick?.change))) return Number(Number(tick.change).toFixed(2))
  const previousClose = Number(tick?.ohlc?.close || 0)
  const lastPrice = Number(tick?.last_price || 0)
  return previousClose > 0 && lastPrice > 0
    ? Number((((lastPrice - previousClose) / previousClose) * 100).toFixed(2))
    : Number(fallback || 0)
}

/**
 * Returns the newest broker timestamp represented by a tick batch.
 */
function newestTickTime(ticks, receivedAt) {
  const timestamps = ticks.map((tick) => {
    const candidate = tick.exchange_timestamp || tick.last_trade_time || tick.timestamp
    const parsed = candidate ? new Date(candidate).getTime() : Number.NaN
    return Number.isFinite(parsed) ? parsed : receivedAt
  })
  return new Date(Math.max(receivedAt, ...timestamps)).toISOString()
}

/**
 * Applies one tick to a watchlist or selected-instrument contract.
 */
export function applyTickToInstrument(instrument, tick, receivedAt = Date.now()) {
  if (!instrument || !tick) return instrument
  const priorPrice = Number(instrument.price || instrument.ltp || 0)
  const nextPrice = Number(tick.last_price || priorPrice)
  return {
    ...instrument,
    price: nextPrice,
    change: tickChangePercent(tick, instrument.change),
    direction: nextPrice > priorPrice ? 'up' : nextPrice < priorPrice ? 'down' : instrument.direction || 'flat',
    lastTickAt: newestTickTime([tick], receivedAt),
  }
}

/**
 * Marks holdings to market and recalculates paper/live P&L from one tick batch.
 */
export function applyTicksToOverview(overview, ticks, receivedAt = Date.now()) {
  if (!overview || !Array.isArray(ticks) || !ticks.length) return overview
  const tickByToken = new Map(ticks.map((tick) => [Number(tick.instrument_token), tick]))
  const watchlist = (overview.watchlist || []).map((instrument) => {
    const tick = tickByToken.get(Number(instrument.instrumentToken))
    return tick ? applyTickToInstrument(instrument, tick, receivedAt) : instrument
  })
  const holdings = (overview.holdings || []).map((holding) => {
    const tick = tickByToken.get(Number(holding.instrumentToken))
    if (!tick) return holding
    const priorLtp = Number(holding.ltp || holding.average || 0)
    const ltp = Number(tick.last_price || priorLtp)
    return {
      ...holding,
      ltp,
      pnl: Number(((ltp - Number(holding.average || 0)) * Number(holding.quantity || 0)).toFixed(2)),
      direction: ltp > priorLtp ? 'up' : ltp < priorLtp ? 'down' : holding.direction || 'flat',
      lastTickAt: newestTickTime([tick], receivedAt),
    }
  })
  const previousUnrealised = Number(overview.pnl?.unrealised || 0)
  const unrealised = Number(holdings.reduce((total, holding) => total + Number(holding.pnl || 0), 0).toFixed(2))
  const fixedDayContribution = Number(overview.pnl?.day || 0) - previousUnrealised
  const priorEquity = Number(overview.funds?.equity)
  const equity = Number.isFinite(priorEquity)
    ? priorEquity - previousUnrealised + unrealised
    : Number(overview.funds?.opening || 0) + fixedDayContribution + unrealised
  return {
    ...overview,
    lastTickAt: newestTickTime(ticks, receivedAt),
    funds: { ...overview.funds, equity: Number(equity.toFixed(2)) },
    pnl: { ...overview.pnl, unrealised, day: Number((fixedDayContribution + unrealised).toFixed(2)) },
    watchlist,
    holdings,
  }
}

/**
 * Converts an epoch into the opening time of its selected chart interval.
 */
function chartBucket(epochSeconds, interval) {
  const seconds = intervalSeconds[interval] || intervalSeconds['15m']
  if (interval === '1D') {
    const indiaOffset = 19800
    return Math.floor((epochSeconds + indiaOffset) / seconds) * seconds - indiaOffset
  }
  return Math.floor(epochSeconds / seconds) * seconds
}

/**
 * Merges a fresh tick into the current OHLC candle or appends a new candle.
 */
export function mergeTickIntoCandles(candles, tick, interval, receivedAt = Date.now()) {
  const price = Number(tick?.last_price || 0)
  if (!price) return candles
  const candidate = tick.exchange_timestamp || tick.last_trade_time || tick.timestamp
  const parsedTime = candidate ? new Date(candidate).getTime() : Number.NaN
  const epochSeconds = Math.floor((Number.isFinite(parsedTime) ? parsedTime : receivedAt) / 1000)
  const time = chartBucket(epochSeconds, interval)
  const current = Array.isArray(candles) ? candles : []
  const last = current.at(-1)
  const volume = Number(tick.volume_traded ?? tick.volume ?? last?.volume ?? 0)
  if (!last || Number(last.time) < time) {
    return [...current, { time, open: price, high: price, low: price, close: price, volume }]
  }
  if (Number(last.time) !== time) return current
  return [
    ...current.slice(0, -1),
    {
      ...last,
      high: Math.max(Number(last.high), price),
      low: Math.min(Number(last.low), price),
      close: price,
      volume,
    },
  ]
}

/**
 * Produces a truthful connection label from socket and heartbeat state.
 */
export function deriveFeedHealth({ connected, streamStatus, lastSignalAt, now = Date.now(), staleAfterMs = 15000 }) {
  if (!connected) return { state: 'disconnected', label: 'Kite login required' }
  if (['error', 'closed', 'unavailable'].includes(streamStatus)) return { state: 'stale', label: 'Feed interrupted' }
  if (['idle', 'connecting', 'reconnecting'].includes(streamStatus)) return { state: 'connecting', label: 'Connecting to live feed' }
  const signalAge = lastSignalAt ? now - new Date(lastSignalAt).getTime() : Number.POSITIVE_INFINITY
  if (!Number.isFinite(signalAge) || signalAge > staleAfterMs) return { state: 'stale', label: 'Live feed is stale' }
  return { state: 'live', label: 'Live market data' }
}
