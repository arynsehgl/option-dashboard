/** Generates deterministic preview data for disconnected Trade Zone sessions. */
const basePrices = {
  'NSE:RELIANCE': 2986.4,
  'NSE:HDFCBANK': 1714.8,
  'NSE:INFY': 1968.15,
  'NSE:TCS': 4238.6,
  'NFO:NIFTY26SEP25000CE': 214.5,
}

/**
 * Produces deterministic Demo Tour candles without implying a real market connection.
 */
export function createPreviewCandles(instrumentKey, count = 140) {
  const base = basePrices[instrumentKey] || 1000
  const start = Math.floor(Date.now() / 1000) - count * 900
  let previous = base * 0.975
  return Array.from({ length: count }, (_, index) => {
    const drift = Math.sin(index / 9) * base * 0.0016 + Math.cos(index / 17) * base * 0.0008
    const open = previous
    const close = Math.max(1, open + drift + ((index % 7) - 3) * base * 0.00018)
    const high = Math.max(open, close) + base * (0.0007 + (index % 3) * 0.0002)
    const low = Math.min(open, close) - base * (0.0006 + (index % 4) * 0.00017)
    previous = close
    return {
      time: start + index * 900,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 18000 + ((index * 7919) % 73000),
    }
  })
}

export const previewWatchlist = [
  { instrumentKey: 'NSE:RELIANCE', instrumentToken: 738561, symbol: 'RELIANCE', exchange: 'NSE', price: 2986.4, change: 0.82 },
  { instrumentKey: 'NSE:HDFCBANK', instrumentToken: 341249, symbol: 'HDFCBANK', exchange: 'NSE', price: 1714.8, change: -0.24 },
  { instrumentKey: 'NSE:INFY', instrumentToken: 408065, symbol: 'INFY', exchange: 'NSE', price: 1968.15, change: 1.13 },
  { instrumentKey: 'NSE:TCS', instrumentToken: 2953217, symbol: 'TCS', exchange: 'NSE', price: 4238.6, change: 0.38 },
  { instrumentKey: 'NFO:NIFTY26SEP25000CE', instrumentToken: 110000001, symbol: 'NIFTY 25000 CE', exchange: 'NFO', price: 214.5, change: -2.43 },
]

export const previewHoldings = [
  { instrumentKey: 'NSE:RELIANCE', instrumentToken: 738561, symbol: 'RELIANCE', exchange: 'NSE', quantity: 25, average: 2848.2, ltp: 2986.4, pnl: 3455 },
  { instrumentKey: 'NSE:HDFCBANK', instrumentToken: 341249, symbol: 'HDFCBANK', exchange: 'NSE', quantity: 40, average: 1684.1, ltp: 1714.8, pnl: 1228 },
  { instrumentKey: 'NSE:INFY', instrumentToken: 408065, symbol: 'INFY', exchange: 'NSE', quantity: 18, average: 1810.5, ltp: 1968.15, pnl: 2837.7 },
]

export const previewOrders = [
  { id: 'preview-1', time: '10:02:14', symbol: 'RELIANCE', side: 'BUY', quantity: 5, type: 'PAPER', price: 2978.5, status: 'FILLED', source: 'Algo paper' },
  { id: 'preview-2', time: '11:18:39', symbol: 'NIFTY 25000 CE', side: 'SELL', quantity: 75, type: 'SL-M', price: 209.2, status: 'TRIGGER PENDING', source: 'AI paper' },
  { id: 'preview-3', time: '12:41:08', symbol: 'INFY', side: 'BUY', quantity: 10, type: 'MARKET', price: 1966.8, status: 'COMPLETE', source: 'Algo paper' },
]

export const previewReport = {
  date: new Date().toISOString().slice(0, 10),
  thesis: 'Momentum remained constructive above VWAP, but option spreads widened after noon. The plan reduced exposure and avoided new entries after the breadth signal weakened.',
  plannedTrades: 4,
  acceptedTrades: 2,
  rejectedTrades: 2,
  realisedPnl: 1840,
  fees: 176.4,
  confidence: 68,
  lessons: [
    'Volume confirmation improved entry quality in the first hour.',
    'The spread guard correctly rejected an illiquid weekly option.',
    'One momentum entry arrived late and should require a tighter time window.',
  ],
}

export const previewAuditEvents = [
  { id: 'preview-log-1', createdAt: new Date().toISOString(), type: 'DAILY_REPORT_CREATED', summary: 'Demo AI report generated for interface illustration.' },
  { id: 'preview-log-2', createdAt: new Date(Date.now() - 20 * 60000).toISOString(), type: 'PAPER_POSITION_FLATTENED', summary: 'Intraday guard flattened two demo positions.' },
  { id: 'preview-log-3', createdAt: new Date(Date.now() - 90 * 60000).toISOString(), type: 'INTENT_REJECTED', summary: 'Demo option spread exceeded the configured liquidity limit.' },
]

/**
 * Returns a clearly marked local Demo Tour of the Trade Zone overview.
 */
export function getPreviewOverview() {
  const holdingsPnl = previewHoldings.reduce((total, holding) => total + holding.pnl, 0)
  return {
    mode: 'demo',
    connection: { status: 'disconnected', label: 'Demo data only', sessionExpiresAt: null },
    funds: { available: 842560.25, used: 157439.75, opening: 1000000, equity: 1012480.35, virtual: true },
    pnl: { day: 12480.35, realised: 4960.2, unrealised: holdingsPnl },
    watchlist: previewWatchlist,
    holdings: previewHoldings,
    orders: previewOrders,
    report: previewReport,
    auditEvents: previewAuditEvents,
  }
}

/**
 * Returns an honest disconnected Playground account without simulated market activity.
 */
export function getDisconnectedOverview(environment = 'paper') {
  const paperMode = environment === 'paper'
  return {
    mode: 'disconnected',
    environment,
    connection: { status: 'not_configured', label: 'Trade Worker not configured', sessionExpiresAt: null },
    funds: paperMode
      ? { available: 1000000, used: 0, opening: 1000000, equity: 1000000, virtual: true }
      : { available: 0, used: 0, opening: 0, equity: 0, virtual: false },
    pnl: { day: 0, realised: 0, unrealised: 0, fees: 0 },
    watchlist: [],
    holdings: [],
    orders: [],
    report: {
      date: new Date().toISOString().slice(0, 10),
      thesis: 'Connect today’s Kite session before live-data research or paper execution can begin.',
      plannedTrades: 0,
      acceptedTrades: 0,
      rejectedTrades: 0,
      realisedPnl: 0,
      fees: 0,
      confidence: 0,
      lessons: [],
    },
    auditEvents: [],
  }
}
