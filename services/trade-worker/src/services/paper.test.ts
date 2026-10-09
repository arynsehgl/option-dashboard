/**
 * Regression tests for paper fills and India-session daily-loss rollover.
 * @module services/paper.test
 */

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { calculatePaperFill, loadRiskState, processPaperIntent } from './paper.js'

/**
 * Creates a chainable Supabase query double that resolves to one result.
 */
function createQueryResult(data: unknown, error: Error | null = null) {
  const result = { data, error }
  const query: Record<string, unknown> = {}
  for (const method of ['eq', 'neq', 'gte']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => result)
  query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return query
}

/**
 * Creates the user-scoped query surface used by risk-state loading.
 */
function createRiskStateSupabase(account: Record<string, unknown>, failingTable?: string) {
  const rowsByTable: Record<string, unknown> = {
    paper_accounts: account,
    paper_positions: [],
    risk_decisions: [],
    paper_fills: [],
  }
  return {
    from: vi.fn((table: string) => ({ select: vi.fn(() => createQueryResult(rowsByTable[table], table === failingTable ? new Error('query failed') : null)) })),
  } as unknown as SupabaseAdmin
}

describe('paper fill simulation', () => {
  it('applies deterministic adverse slippage without touching a broker client', () => {
    expect(calculatePaperFill({ side: 'BUY', entryPrice: 100, quantity: 10 })).toMatchObject({ fillPrice: 100.02, slippageBasisPoints: 2 })
    expect(calculatePaperFill({ side: 'SELL', entryPrice: 100, quantity: 10 })).toMatchObject({ fillPrice: 99.98, slippageBasisPoints: 2 })
  })

  it('does not carry a prior session loss into the current risk state', async () => {
    const supabase = createRiskStateSupabase({
      virtual_balance: 1000000,
      realised_daily_pnl: -50000,
      lifetime_realised_pnl: -50000,
      total_fees: 0,
      utilised_capital: 0,
      pnl_session_date: '2000-01-01',
    })
    await expect(loadRiskState(supabase, 'user-1')).resolves.toMatchObject({ realisedDailyPnl: 0 })
  })

  it('fails closed when any risk-state query is unavailable', async () => {
    const supabase = createRiskStateSupabase({
      virtual_balance: 1000000,
      realised_daily_pnl: 0,
      lifetime_realised_pnl: 0,
      total_fees: 0,
      utilised_capital: 0,
      pnl_session_date: '2000-01-01',
    }, 'paper_positions')
    await expect(loadRiskState(supabase, 'user-1')).rejects.toThrow('query failed')
  })

  it('rejects an AI intent before any database read when its run lease is absent', async () => {
    const from = vi.fn()
    const rpc = vi.fn()
    const supabase = { from, rpc } as unknown as SupabaseAdmin
    await expect(processPaperIntent(supabase, {
      userId: 'user-1',
      environment: 'paper',
      instrumentKey: 'NSE:TEST',
      side: 'BUY',
      quantity: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      confidence: 80,
      thesis: 'Test fenced intent.',
      invalidation: 'Test invalidation.',
      quoteTimestamp: '2026-01-05T04:00:00.000Z',
      source: 'ai',
    })).rejects.toThrow('active run lease')
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
