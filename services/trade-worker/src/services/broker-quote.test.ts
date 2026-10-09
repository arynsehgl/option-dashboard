/**
 * Regression tests for fail-closed Kite quote normalization.
 * @module services/broker-quote.test
 */

import { describe, expect, it } from 'vitest'
import { resolveBrokerQuote } from './broker-quote.js'

describe('resolveBrokerQuote', () => {
  it('retains the broker-authored quote packet timestamp', () => {
    expect(resolveBrokerQuote({
      last_price: 125.5,
      timestamp: '2026-01-05T09:30:01+05:30',
    }, 'NSE:RELIANCE')).toEqual({
      lastPrice: 125.5,
      quoteTimestamp: '2026-01-05T04:00:01.000Z',
    })
    expect(resolveBrokerQuote({
      last_price: 125.5,
      timestamp: new Date(2026, 0, 5, 9, 30, 1),
    }, 'NSE:RELIANCE').quoteTimestamp).toBe('2026-01-05T04:00:01.000Z')
  })

  it('rejects a quote when the broker timestamp is absent or invalid', () => {
    expect(() => resolveBrokerQuote({ last_price: 125.5 }, 'NSE:RELIANCE')).toThrow('broker quote timestamp')
    expect(() => resolveBrokerQuote({ last_price: 125.5, timestamp: 'not-a-date' }, 'NSE:RELIANCE')).toThrow('timestamp was invalid')
  })

  it('rejects a missing or non-positive broker price', () => {
    expect(() => resolveBrokerQuote({ last_price: 0, timestamp: new Date() }, 'NSE:RELIANCE')).toThrow('valid Kite quote price')
  })
})
