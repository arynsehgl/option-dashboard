/**
 * Regression tests for India-market paper P&L session normalization.
 * @module services/trading-session.test
 */

import { describe, expect, it } from 'vitest'
import { getIndiaMarketClock, getIndiaTradingDate, getIndiaTradingDayStart, isIndiaPaperFillWindow, isIndiaPaperFlattenWindow, resolveDailyRealisedPnl } from './trading-session.js'

describe('paper trading sessions', () => {
  it('derives India dates and timestamp query boundaries deterministically', () => {
    const tradingDate = getIndiaTradingDate(new Date('2026-01-01T20:00:00.000Z'))
    expect(tradingDate).toBe('2026-01-02')
    expect(getIndiaTradingDayStart(tradingDate)).toBe('2026-01-02T00:00:00+05:30')
  })

  it('returns zero for a stale account session and current P&L for a matching session', () => {
    expect(resolveDailyRealisedPnl({ realised_daily_pnl: -2500, pnl_session_date: '2026-01-01' }, '2026-01-02')).toBe(0)
    expect(resolveDailyRealisedPnl({ realised_daily_pnl: -2500, pnl_session_date: '2026-01-02' }, '2026-01-02')).toBe(-2500)
  })

  it('allows paper fills only during the weekday 09:15 through 15:19 IST window', () => {
    expect(getIndiaMarketClock(new Date('2026-01-05T03:45:00.000Z'))).toEqual({ weekday: 'Mon', minutesSinceMidnight: 555 })
    expect(isIndiaPaperFillWindow(new Date('2026-01-05T03:45:00.000Z'))).toBe(true)
    expect(isIndiaPaperFillWindow(new Date('2026-01-05T09:49:59.000Z'))).toBe(true)
    expect(isIndiaPaperFillWindow(new Date('2026-01-05T09:50:00.000Z'))).toBe(false)
    expect(isIndiaPaperFillWindow(new Date('2026-01-04T04:00:00.000Z'))).toBe(false)
  })

  it('provides a separate system-only flatten retry runway through 15:29 IST', () => {
    expect(isIndiaPaperFlattenWindow(new Date('2026-01-05T09:49:59.000Z'))).toBe(false)
    expect(isIndiaPaperFlattenWindow(new Date('2026-01-05T09:50:00.000Z'))).toBe(true)
    expect(isIndiaPaperFlattenWindow(new Date('2026-01-05T09:59:59.000Z'))).toBe(true)
    expect(isIndiaPaperFlattenWindow(new Date('2026-01-05T10:00:00.000Z'))).toBe(false)
    expect(isIndiaPaperFlattenWindow(new Date('2026-01-04T09:50:00.000Z'))).toBe(false)
  })
})
