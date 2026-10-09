/**
 * Regression tests for bounded public and AI request contracts.
 * @module request-contracts.test
 */

import { describe, expect, it } from 'vitest'
import { candleQuerySchema, instrumentKeySchema, tradeInvalidationSchema, tradeThesisSchema } from './request-contracts.js'

describe('bounded worker request contracts', () => {
  it('accepts only the explicitly mapped candle intervals', () => {
    expect(candleQuerySchema.parse({ instrument: 'NSE:RELIANCE', interval: '15m' })).toEqual({ instrument: 'NSE:RELIANCE', interval: '15m' })
    expect(() => candleQuerySchema.parse({ instrument: 'NSE:RELIANCE', interval: '2m' })).toThrow()
  })

  it('rejects oversized instrument and model-generated explanation fields', () => {
    expect(() => instrumentKeySchema.parse('N'.repeat(101))).toThrow()
    expect(() => tradeThesisSchema.parse('T'.repeat(2001))).toThrow()
    expect(() => tradeInvalidationSchema.parse('I'.repeat(1001))).toThrow()
  })
})
