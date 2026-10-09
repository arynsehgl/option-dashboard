/**
 * Regression tests for scheduled-task rejection containment.
 * @module services/scheduler.test
 */

import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import type { FirebaseIdentitySource } from '../lib/firebase.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { writeAuditEvent } from './audit.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'
import {
  createPaperFlattenIntentKey,
  flattenPaperPositions,
  loadEntitledProfiles,
  PAPER_FLATTEN_CRON_EXPRESSION,
  runScheduledTask,
} from './scheduler.js'

vi.mock('./audit.js', () => ({ writeAuditEvent: vi.fn() }))
vi.mock('./market-data.js', () => ({ getAuthenticatedMarketDataClient: vi.fn() }))

describe('scheduled task containment', () => {
  it('logs a rejected task without rejecting the scheduler callback', async () => {
    const error = vi.fn()
    const logger = { error } as unknown as Logger
    await expect(runScheduledTask(logger, 'test-job', async () => {
      throw new Error('transient failure')
    })).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledTask: 'test-job' }),
      'Scheduled task failed safely',
    )
  })

  it('uses a non-overlapping minute-by-minute close runway', () => {
    expect(PAPER_FLATTEN_CRON_EXPRESSION).toBe('20-29 15 * * 1-5')
  })

  it('binds same-day flatten idempotency to the exact position version', () => {
    const initial = { id: 'position-1', user_id: 'user-1', instrument_key: 'NSE:TEST', quantity: 5, updated_at: '2026-01-05T09:49:00.000Z' }
    const reopened = { ...initial, quantity: 3, updated_at: '2026-01-05T09:55:00.000Z' }
    expect(createPaperFlattenIntentKey(initial, '2026-01-05')).not.toBe(createPaperFlattenIntentKey(reopened, '2026-01-05'))
  })

  it('isolates quote and RPC failures so later open positions still flatten', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T09:50:00.000Z'))
    const positions = [
      { id: 'position-1', user_id: 'user-1', instrument_key: 'NSE:MISSING', quantity: 5, updated_at: '2026-01-05T09:40:00.000Z' },
      { id: 'position-2', user_id: 'user-1', instrument_key: 'NSE:RPCFAIL', quantity: -2, updated_at: '2026-01-05T09:41:00.000Z' },
      { id: 'position-3', user_id: 'user-1', instrument_key: 'NSE:SUCCESS', quantity: 3, updated_at: '2026-01-05T09:42:00.000Z' },
    ]
    const getQuote = vi.fn()
      .mockResolvedValueOnce({ 'NSE:MISSING': { last_price: 100 } })
      .mockResolvedValueOnce({ 'NSE:RPCFAIL': { last_price: 101, timestamp: '2026-01-05T15:20:00+05:30' } })
      .mockResolvedValueOnce({ 'NSE:SUCCESS': { last_price: 102, timestamp: '2026-01-05T15:20:00+05:30' } })
    vi.mocked(getAuthenticatedMarketDataClient).mockResolvedValue({ market: { getQuote } } as never)
    vi.mocked(writeAuditEvent).mockResolvedValue(undefined)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error('one RPC failed') })
      .mockResolvedValueOnce({ data: 'order-3', error: null })
    const query = { neq: vi.fn().mockResolvedValue({ data: positions, error: null }) }
    const supabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
      rpc,
    } as unknown as SupabaseAdmin
    const logger = { error: vi.fn() } as unknown as Logger

    await flattenPaperPositions(supabase, {} as WorkerConfig, logger)

    expect(getQuote).toHaveBeenCalledTimes(3)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_intent_key: createPaperFlattenIntentKey(positions[2], '2026-01-05'),
      p_instrument_key: 'NSE:SUCCESS',
      p_source: 'system',
    })
    expect(writeAuditEvent).not.toHaveBeenCalledWith(supabase, 'user-1', 'PAPER_POSITION_FLATTENED', expect.anything(), expect.anything())
    expect(writeAuditEvent).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('rechecks Firestore before scheduling and refreshes the internal profile mirror', async () => {
    const profileUuid = '31a7415b-b537-4d37-94eb-724df8cb33a4'
    const select = vi.fn().mockResolvedValue({ data: [{ id: profileUuid, firebase_uid: 'firebase-user-1' }], error: null })
    const rpc = vi.fn().mockResolvedValue({ data: profileUuid, error: null })
    const supabase = { from: vi.fn().mockReturnValue({ select }), rpc } as unknown as SupabaseAdmin
    const firebaseIdentity = {
      verifyIdToken: vi.fn(),
      getUserIdentity: vi.fn().mockResolvedValue({ uid: 'firebase-user-1', email: 'user@example.com', emailVerified: true }),
      getUserProfile: vi.fn().mockResolvedValue({
        isTrialActive: false,
        subscriptionStatus: 'active',
        subscriptionEndDate: '2099-01-01T00:00:00.000Z',
      }),
      checkReadiness: vi.fn().mockResolvedValue(undefined),
    } as FirebaseIdentitySource
    const logger = { error: vi.fn(), warn: vi.fn() } as unknown as Logger
    const profiles = await loadEntitledProfiles(supabase, firebaseIdentity, {} as WorkerConfig, logger)
    expect(profiles).toEqual([{ id: profileUuid, firebaseUid: 'firebase-user-1' }])
    expect(firebaseIdentity.getUserProfile).toHaveBeenCalledWith('firebase-user-1')
    expect(rpc).toHaveBeenCalledWith('resolve_firebase_profile', expect.objectContaining({
      p_firebase_uid: 'firebase-user-1',
      p_subscription_status: 'active',
    }))
  })

  it('fails closed for a disabled Firebase account without scheduling its profile', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: '31a7415b-b537-4d37-94eb-724df8cb33a4', firebase_uid: 'disabled-user' }],
      error: null,
    })
    const rpc = vi.fn()
    const supabase = { from: vi.fn().mockReturnValue({ select }), rpc } as unknown as SupabaseAdmin
    const firebaseIdentity = {
      verifyIdToken: vi.fn(),
      getUserIdentity: vi.fn().mockRejectedValue(new Error('Firebase account is disabled.')),
      getUserProfile: vi.fn().mockResolvedValue({ subscriptionStatus: 'active' }),
      checkReadiness: vi.fn(),
    } as FirebaseIdentitySource
    const logger = { error: vi.fn(), warn: vi.fn() } as unknown as Logger
    await expect(loadEntitledProfiles(supabase, firebaseIdentity, {} as WorkerConfig, logger)).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseUid: 'disabled-user' }),
      'Firebase entitlement revalidation failed for one scheduled user',
    )
  })
})
