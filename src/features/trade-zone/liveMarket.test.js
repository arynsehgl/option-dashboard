/** Verifies live-market normalization, freshness, and candle merge behavior. */
import { describe, expect, it } from 'vitest'
import {
  applyTicksToOverview,
  collectStreamInstrumentTokens,
  deriveFeedHealth,
  MAX_STREAM_INSTRUMENT_TOKENS,
  mergeTickIntoCandles,
} from './liveMarket'

const now = Date.parse('2026-09-09T04:01:00.000Z')

/**
 * Creates a minimal paper overview for deterministic live-market tests.
 */
function overview() {
  return {
    mode: 'paper',
    funds: { opening: 1000000, available: 990000, used: 10000, equity: 1001000 },
    pnl: { day: 1000, realised: 0, unrealised: 1000 },
    watchlist: [{ instrumentToken: 101, symbol: 'TEST', price: 110, change: 10 }],
    holdings: [{ instrumentToken: 101, symbol: 'TEST', quantity: 100, average: 100, ltp: 110, pnl: 1000 }],
  }
}

describe('Trade Zone live market state', () => {
  it('subscribes to the unique union of visible instrument tokens', () => {
    const state = overview()
    state.holdings.push({ instrumentToken: 202 })
    expect(collectStreamInstrumentTokens(state, { instrumentToken: 303 })).toEqual([303, 101, 202])
  })

  it('prioritizes the selected instrument and never exceeds the server subscription limit', () => {
    const state = {
      watchlist: Array.from({ length: 120 }, (_, index) => ({ instrumentToken: index + 1 })),
      holdings: Array.from({ length: 40 }, (_, index) => ({ instrumentToken: index + 201 })),
    }
    const tokens = collectStreamInstrumentTokens(state, { instrumentToken: 999 })
    expect(tokens).toHaveLength(MAX_STREAM_INSTRUMENT_TOKENS)
    expect(tokens[0]).toBe(999)
    expect(tokens).not.toContain(100)
  })

  it('marks holdings, P&L, watchlist, and equity from the same real tick', () => {
    const next = applyTicksToOverview(overview(), [{ instrument_token: 101, last_price: 112, ohlc: { close: 100 } }], now)
    expect(next.watchlist[0].price).toBe(112)
    expect(next.holdings[0].pnl).toBe(1200)
    expect(next.pnl.unrealised).toBe(1200)
    expect(next.pnl.day).toBe(1200)
    expect(next.funds.equity).toBe(1001200)
  })

  it('updates the active candle without fabricating additional candles', () => {
    const candles = [{ time: 1788926400, open: 100, high: 102, low: 99, close: 101, volume: 1000 }]
    const next = mergeTickIntoCandles(candles, { last_price: 103, volume_traded: 1200 }, '15m', now)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ open: 100, high: 103, low: 99, close: 103, volume: 1200 })
  })

  it('marks a connected stream stale when its heartbeat disappears', () => {
    expect(deriveFeedHealth({ connected: true, streamStatus: 'connected', lastSignalAt: now - 20000, now }).state).toBe('stale')
    expect(deriveFeedHealth({ connected: true, streamStatus: 'connected', lastSignalAt: now - 5000, now }).state).toBe('live')
    expect(deriveFeedHealth({ connected: true, streamStatus: 'error', lastSignalAt: now, now }).state).toBe('stale')
    expect(deriveFeedHealth({ connected: true, streamStatus: 'reconnecting', lastSignalAt: now, now }).state).not.toBe('live')
  })
})
