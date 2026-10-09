/**
 * Regression tests for deterministic paper-trading risk decisions.
 * @module services/risk.test
 */

import { describe, expect, it } from 'vitest'
import type { RiskState, TradeIntent } from '../types.js'
import { assessTradeIntent } from './risk.js'

const marketOpenNow = new Date('2026-01-05T04:00:00.000Z')

/**
 * Creates a safe baseline paper intent for focused risk mutations.
 */
function intent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return {
    userId: 'user-1',
    environment: 'paper',
    instrumentKey: 'NSE:RELIANCE',
    side: 'BUY',
    quantity: 10,
    entryPrice: 100,
    stopLossPrice: 99.5,
    targetPrice: 101,
    confidence: 70,
    thesis: 'Price and volume confirm a controlled intraday momentum setup.',
    invalidation: 'Exit if price closes below the validated support level.',
    quoteTimestamp: marketOpenNow.toISOString(),
    ...overrides,
  }
}

/**
 * Creates a baseline virtual account state for deterministic tests.
 */
function state(overrides: Partial<RiskState> = {}): RiskState {
  return {
    virtualCapital: 100000,
    realisedDailyPnl: 0,
    openPositionCount: 0,
    utilisedCapital: 0,
    existingIntentKeys: new Set(),
    positionsByInstrument: new Map(),
    ...overrides,
  }
}

describe('assessTradeIntent', () => {
  it('approves a fresh explained paper intent inside every default limit', () => {
    const decision = assessTradeIntent(intent(), state(), marketOpenNow)
    expect(decision.approved).toBe(true)
    expect(decision.reasonCodes).toEqual([])
  })

  it('rejects a stale quote and excessive per-trade risk', () => {
    const decision = assessTradeIntent(intent({ quoteTimestamp: new Date(marketOpenNow.getTime() - 10000).toISOString(), stopLossPrice: 40 }), state(), marketOpenNow)
    expect(decision.approved).toBe(false)
    expect(decision.reasonCodes).toContain('STALE_QUOTE')
    expect(decision.reasonCodes).toContain('PER_TRADE_RISK_LIMIT')
  })

  it('halts entries after the daily loss boundary', () => {
    const decision = assessTradeIntent(intent(), state({ realisedDailyPnl: -2000 }), marketOpenNow)
    expect(decision.approved).toBe(false)
    expect(decision.reasonCodes).toContain('DAILY_LOSS_STOP')
  })

  it('rejects any runtime intent that attempts to leave the paper environment', () => {
    const decision = assessTradeIntent(intent({ environment: 'live' as never }), state(), marketOpenNow)
    expect(decision.approved).toBe(false)
    expect(decision.reasonCodes).toContain('LIVE_AUTONOMY_DISABLED')
  })

  it('rejects a duplicate intent identity', () => {
    const first = assessTradeIntent(intent(), state(), marketOpenNow)
    const duplicateState = state({ existingIntentKeys: new Set([first.intentKey]) })
    expect(assessTradeIntent(intent(), duplicateState, marketOpenNow).reasonCodes).toContain('DUPLICATE_INTENT')
  })

  it('allows an existing position to close without double-counting utilisation', () => {
    const positionsByInstrument = new Map([['NSE:RELIANCE', { quantity: 10, averagePrice: 100 }]])
    const decision = assessTradeIntent(intent({ side: 'SELL', quantity: 10, stopLossPrice: 101 }), state({ virtualCapital: 1000, utilisedCapital: 1000, openPositionCount: 1, positionsByInstrument }), marketOpenNow)
    expect(decision.reasonCodes).not.toContain('UTILISATION_LIMIT')
    expect(decision.calculatedUtilisationPercent).toBe(0)
  })

  it('rejects otherwise valid paper intents before open, after 15:19, and on weekends', () => {
    const closedInstants = [
      new Date('2026-01-05T03:44:59.000Z'),
      new Date('2026-01-05T09:50:00.000Z'),
      new Date('2026-01-04T04:00:00.000Z'),
    ]
    for (const now of closedInstants) {
      const decision = assessTradeIntent(intent({ quoteTimestamp: now.toISOString() }), state(), now)
      expect(decision.reasonCodes).toContain('MARKET_SESSION_CLOSED')
    }
  })
})
