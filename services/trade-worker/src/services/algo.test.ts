/**
 * Regression tests for paper-strategy indicators and the execution safety gate.
 * @module services/algo.test
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { evaluateActivePaperStrategies, evaluateRule, exponentialMovingAverage, paperStrategyExecutionEnabled, relativeStrengthIndex } from './algo.js'

const baseContext = {
  lastPrice: 102,
  vwap: 100,
  latestVolume: 1800,
  averageVolume: 1000,
  closes: [96, 97, 98, 99, 100, 101, 99, 98, 97, 98, 99, 100, 101, 99, 102],
  currentMinutes: 600,
}

describe('paper algo indicators', () => {
  it('detects a price crossover above VWAP', () => {
    expect(evaluateRule({ field: 'price', operator: 'crosses_above', value: 'VWAP' }, baseContext)).toBe(true)
  })

  it('evaluates volume multiples against prior candle volume', () => {
    expect(evaluateRule({ field: 'volume', operator: 'greater_than', value: '1.5x average' }, baseContext)).toBe(true)
  })

  it('calculates bounded momentum indicators', () => {
    expect(exponentialMovingAverage([100, 102, 104], 2)).toHaveLength(3)
    expect(relativeStrengthIndex(Array.from({ length: 16 }, (_, index) => 100 + index))).toBe(100)
  })

  it('keeps automated strategy execution disabled until exit guards exist', async () => {
    const from = vi.fn()
    const result = await evaluateActivePaperStrategies({ from } as unknown as SupabaseAdmin, {} as WorkerConfig)
    expect(paperStrategyExecutionEnabled).toBe(false)
    expect(result).toMatchObject({ evaluated: 0, triggered: 0, disabled: true })
    expect(from).not.toHaveBeenCalled()
  })
})
