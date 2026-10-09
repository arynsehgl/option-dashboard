/**
 * Regression tests for the broker-mutation-free market-data capability.
 * @module services/market-data.test
 */

import { describe, expect, it, vi } from 'vitest'
import type { Connect } from 'kiteconnect'
import { createReadOnlyMarketDataClient } from './market-data.js'

describe('read-only Kite market-data capability', () => {
  it('does not expose any broker order mutation method', () => {
    const kite = {
      getLTP: vi.fn(),
      getQuote: vi.fn(),
      getHistoricalData: vi.fn(),
      getHoldings: vi.fn(),
      placeOrder: vi.fn(),
    } as unknown as Connect
    const market = createReadOnlyMarketDataClient(kite)
    expect('placeOrder' in market).toBe(false)
    expect('modifyOrder' in market).toBe(false)
    expect('cancelOrder' in market).toBe(false)
    expect(Object.isFrozen(market)).toBe(true)
  })
})
