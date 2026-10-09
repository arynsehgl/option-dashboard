/** Verifies disconnected preview data preserves the Trade Zone data contracts. */
import { describe, expect, it } from 'vitest'
import { createPreviewCandles, getDisconnectedOverview, getPreviewOverview } from './demoData'

describe('Trade Zone preview contracts', () => {
  it('labels optional sample data as a demo and cannot imply a broker session', () => {
    const overview = getPreviewOverview()
    expect(overview.mode).toBe('demo')
    expect(overview.connection.status).toBe('disconnected')
    expect(overview.holdings.length).toBeGreaterThan(0)
  })

  it('starts every disconnected paper user with an empty ₹10 lakh virtual account', () => {
    const overview = getDisconnectedOverview('paper')
    expect(overview.mode).toBe('disconnected')
    expect(overview.funds).toMatchObject({ opening: 1000000, available: 1000000, used: 0, equity: 1000000, virtual: true })
    expect(overview.holdings).toEqual([])
    expect(overview.orders).toEqual([])
  })

  it('generates valid ordered OHLC candles', () => {
    const candles = createPreviewCandles('NSE:RELIANCE', 12)
    expect(candles).toHaveLength(12)
    expect(candles.every((candle) => candle.high >= Math.max(candle.open, candle.close))).toBe(true)
    expect(candles.every((candle) => candle.low <= Math.min(candle.open, candle.close))).toBe(true)
    expect(candles.every((candle, index) => index === 0 || candle.time > candles[index - 1].time)).toBe(true)
  })
})
