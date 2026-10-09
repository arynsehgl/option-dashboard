/**
 * Regression tests for active AI-run uniqueness and stale recovery.
 * @module services/ai-runs.test
 */

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseAdmin } from '../lib/supabase.js'
import {
  activeAiRunTimeoutMs,
  createActiveAiRun,
  finalizeActiveAiRun,
  hashAiRunLease,
  updateActiveAiRun,
} from './ai-runs.js'

/**
 * Creates the two Supabase query chains used by active-run creation.
 */
function createSupabaseDouble(insertResult: { data: unknown; error: unknown }) {
  const recoveryQuery: Record<string, ReturnType<typeof vi.fn>> = {}
  recoveryQuery.eq = vi.fn(() => recoveryQuery)
  recoveryQuery.in = vi.fn(() => recoveryQuery)
  recoveryQuery.lt = vi.fn(async () => ({ data: null, error: null }))
  const update = vi.fn(() => recoveryQuery)
  const single = vi.fn(async () => insertResult)
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ update, insert }))
  return { supabase: { from } as unknown as SupabaseAdmin, recoveryQuery, update, insert }
}

describe('createActiveAiRun', () => {
  it('recovers only rows older than the documented timeout before inserting', async () => {
    const now = new Date('2026-01-05T04:00:00.000Z')
    const { supabase, recoveryQuery, update, insert } = createSupabaseDouble({ data: { id: 'run-1' }, error: null })
    const run = await createActiveAiRun(supabase, {
      userId: 'user-1',
      phase: 'open_revalidation',
      status: 'running',
    }, now)
    expect(run).toMatchObject({ id: 'run-1', leaseToken: expect.any(String) })
    expect(run?.leaseToken).toHaveLength(43)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', completed_at: now.toISOString(), lease_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ lease_token_hash: hashAiRunLease(run?.leaseToken || '') }))
    expect(recoveryQuery.lt).toHaveBeenCalledWith('started_at', new Date(now.getTime() - activeAiRunTimeoutMs).toISOString())
  })

  it('returns a conflict result for PostgreSQL 23505 races', async () => {
    const { supabase } = createSupabaseDouble({ data: null, error: { code: '23505' } })
    await expect(createActiveAiRun(supabase, {
      userId: 'user-1',
      phase: 'morning_research',
      status: 'queued',
    })).resolves.toBeNull()
  })

  it('propagates non-uniqueness database failures', async () => {
    const { supabase } = createSupabaseDouble({ data: null, error: { code: '08006', message: 'connection failed' } })
    await expect(createActiveAiRun(supabase, {
      userId: 'user-1',
      phase: 'morning_research',
      status: 'queued',
    })).rejects.toMatchObject({ code: '08006' })
  })

  it('fails closed when an insert reports no identifier', async () => {
    const { supabase } = createSupabaseDouble({ data: null, error: null })
    await expect(createActiveAiRun(supabase, {
      userId: 'user-1',
      phase: 'morning_research',
      status: 'queued',
    })).rejects.toThrow('returned no identifier')
  })
})

describe('AI run lease mutations', () => {
  it('conditions terminal updates on the active status and hashed lease', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    query.eq = vi.fn(() => query)
    query.in = vi.fn(() => query)
    query.select = vi.fn(() => query)
    query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null })
    const update = vi.fn(() => query)
    const supabase = { from: vi.fn(() => ({ update })) } as unknown as SupabaseAdmin

    await expect(updateActiveAiRun(supabase, 'user-1', { id: 'run-1', leaseToken: 'lease-secret' }, { status: 'failed' })).resolves.toBe(true)
    expect(query.eq).toHaveBeenCalledWith('lease_token_hash', hashAiRunLease('lease-secret'))
    expect(query.in).toHaveBeenCalledWith('status', ['queued', 'running'])
  })

  it('returns false instead of overwriting a recovered terminal run', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    query.eq = vi.fn(() => query)
    query.in = vi.fn(() => query)
    query.select = vi.fn(() => query)
    query.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => query) })) } as unknown as SupabaseAdmin
    await expect(updateActiveAiRun(supabase, 'user-1', { id: 'run-1', leaseToken: 'revoked-lease' }, { status: 'completed' })).resolves.toBe(false)
  })

  it('sends the raw capability only to the atomic finalization RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const supabase = { rpc } as unknown as SupabaseAdmin
    await finalizeActiveAiRun(supabase, 'user-1', { id: 'run-1', leaseToken: 'active-lease' }, {
      status: 'no_trade',
      summary: 'No qualifying trade.',
      intentCount: 0,
      confidence: 0,
      invalidation: 'No evidence.',
      evidenceIds: [],
    })
    expect(rpc).toHaveBeenCalledWith('finalize_ai_run', expect.objectContaining({
      p_ai_run_id: 'run-1',
      p_ai_run_lease: 'active-lease',
      p_status: 'no_trade',
    }))
  })
})
