/** Regression tests for guarded, tenant-independent instrument-master refreshes. */
import type { Instrument } from 'kiteconnect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getAuthenticatedKiteClient } from './broker.js'
import {
  resetInstrumentRefreshCoordinatorForTests,
  synchronizeInstrumentMaster,
} from './instruments.js'

vi.mock('./broker.js', () => ({ getAuthenticatedKiteClient: vi.fn() }))

interface CandidateRow {
  user_id: string
  token_expires_at: string
  updated_at: string
}

interface SupabaseHarnessOptions {
  candidates?: CandidateRow[]
  authoritativeRefreshedAt?: string | null
}

/** Creates one valid minimum-size Kite catalogue with deterministic unique keys. */
function createCatalogue() {
  return Array.from({ length: 10000 }, (_, index) => ({
    instrument_token: String(index + 1),
    exchange_token: String(index + 10001),
    tradingsymbol: `SYMBOL${index}`,
    name: `Instrument ${index}`,
    last_price: 0,
    expiry: null,
    strike: 0,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: 'EQ',
    segment: 'NSE',
    exchange: 'NSE',
  })) as unknown as Instrument[]
}

/** Creates one connected candidate row that remains valid for the fixed test clock. */
function createCandidate(userId: string, updatedAt = '2026-10-09T08:00:00.000Z'): CandidateRow {
  return {
    user_id: userId,
    token_expires_at: '2026-10-10T00:30:00.000Z',
    updated_at: updatedAt,
  }
}

/** Creates a manually controlled promise for single-flight concurrency tests. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/**
 * Creates a narrow Supabase double that records every catalogue mutation while
 * supporting the exact ordered candidate and authoritative-cooldown queries.
 */
function createSupabaseHarness(options: SupabaseHarnessOptions = {}) {
  const candidates = options.candidates || []
  const upsertCalls: unknown[][] = []
  const staleUpdateCalls: unknown[] = []
  const brokerFilters: Array<[string, unknown]> = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'broker_connections') {
        let preferredUserId: string | undefined
        const query = {
          select: vi.fn(),
          eq: vi.fn((field: string, value: unknown) => {
            brokerFilters.push([field, value])
            if (field === 'user_id' && typeof value === 'string') preferredUserId = value
            return query
          }),
          gt: vi.fn((field: string, value: unknown) => {
            brokerFilters.push([`${field}>`, value])
            return query
          }),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: candidates.find((candidate) => candidate.user_id === preferredUserId) || null,
            error: null,
          })),
          then: <TResult1 = { data: CandidateRow[]; error: null }, TResult2 = never>(
            onfulfilled?: ((value: { data: CandidateRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) => Promise.resolve({ data: candidates, error: null }).then(onfulfilled, onrejected),
        }
        query.select.mockReturnValue(query)
        return query
      }

      if (table === 'instruments') {
        const query = {
          select: vi.fn(),
          eq: vi.fn(),
          order: vi.fn(),
          limit: vi.fn(),
          maybeSingle: vi.fn(async () => ({
            data: options.authoritativeRefreshedAt ? { refreshed_at: options.authoritativeRefreshedAt } : null,
            error: null,
          })),
          upsert: vi.fn(async (rows: unknown[]) => {
            upsertCalls.push(rows)
            return { error: null }
          }),
          update: vi.fn((payload: unknown) => {
            staleUpdateCalls.push(payload)
            return query
          }),
          lt: vi.fn(),
        }
        query.select.mockReturnValue(query)
        query.eq.mockReturnValue(query)
        query.order.mockReturnValue(query)
        query.limit.mockReturnValue(query)
        query.lt.mockReturnValue(query)
        return query
      }

      throw new Error(`Unexpected test table: ${table}`)
    }),
  } as unknown as SupabaseAdmin

  return { supabase, upsertCalls, staleUpdateCalls, brokerFilters }
}

/** Installs a user-specific authenticated Kite catalogue response. */
function mockCandidateCatalogues(responses: Record<string, Instrument[] | Error | Promise<Instrument[]>>) {
  vi.mocked(getAuthenticatedKiteClient).mockImplementation(async (_supabase, _config, userId) => ({
    kite: {
      getInstruments: vi.fn(async () => {
        const response = responses[userId]
        if (!response) throw new Error('Missing test candidate response.')
        if (response instanceof Error) throw response
        return response
      }),
    },
  } as never))
}

describe('instrument-master refresh coordination', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T08:30:00.000Z'))
    vi.clearAllMocks()
    resetInstrumentRefreshCoordinatorForTests()
  })

  afterEach(() => {
    resetInstrumentRefreshCoordinatorForTests()
    vi.useRealTimers()
  })

  it('uses the just-verified callback user before ordered fallback candidates', async () => {
    const preferred = createCandidate('preferred-user', '2026-10-09T08:29:00.000Z')
    const fallback = createCandidate('fallback-user', '2026-10-09T08:28:00.000Z')
    const harness = createSupabaseHarness({ candidates: [fallback, preferred] })
    mockCandidateCatalogues({
      'preferred-user': createCatalogue(),
      'fallback-user': new Error('Fallback must not be reached.'),
    })

    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig, 'preferred-user')).resolves.toMatchObject({
      status: 'refreshed',
      count: 10000,
    })

    expect(vi.mocked(getAuthenticatedKiteClient).mock.calls.map((call) => call[2])).toEqual(['preferred-user'])
    expect(harness.brokerFilters).toContainEqual(['status', 'connected'])
    expect(harness.brokerFilters.some(([field]) => field === 'token_expires_at>')).toBe(true)
    expect(harness.upsertCalls).toHaveLength(10)
    expect(harness.staleUpdateCalls).toHaveLength(1)
  })

  it('fails over in deterministic candidate order without mutating for a failed candidate', async () => {
    const first = createCandidate('first-user', '2026-10-09T08:29:00.000Z')
    const second = createCandidate('second-user', '2026-10-09T08:28:00.000Z')
    const harness = createSupabaseHarness({ candidates: [first, second] })
    mockCandidateCatalogues({
      'first-user': new Error('Expired upstream session.'),
      'second-user': createCatalogue(),
    })

    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).resolves.toMatchObject({ status: 'refreshed' })

    expect(vi.mocked(getAuthenticatedKiteClient).mock.calls.map((call) => call[2])).toEqual(['first-user', 'second-user'])
    expect(harness.upsertCalls).toHaveLength(10)
    expect(harness.staleUpdateCalls).toHaveLength(1)
  })

  it('coalesces concurrent requests and enforces the five-minute success cooldown', async () => {
    const deferred = createDeferred<Instrument[]>()
    const harness = createSupabaseHarness({ candidates: [createCandidate('connected-user')] })
    mockCandidateCatalogues({ 'connected-user': deferred.promise })

    const first = synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)
    const concurrent = synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)
    deferred.resolve(createCatalogue())
    const [firstResult, concurrentResult] = await Promise.all([first, concurrent])

    expect(firstResult).toEqual(concurrentResult)
    expect(vi.mocked(getAuthenticatedKiteClient)).toHaveBeenCalledTimes(1)
    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).resolves.toMatchObject({ status: 'skipped' })
    expect(vi.mocked(getAuthenticatedKiteClient)).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    mockCandidateCatalogues({ 'connected-user': createCatalogue() })
    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).resolves.toMatchObject({ status: 'refreshed' })
    expect(vi.mocked(getAuthenticatedKiteClient)).toHaveBeenCalledTimes(2)
  })

  it('honours an authoritative recent database refresh after local state is reset', async () => {
    const harness = createSupabaseHarness({
      candidates: [createCandidate('connected-user')],
      authoritativeRefreshedAt: '2026-10-09T08:29:00.000Z',
    })
    mockCandidateCatalogues({ 'connected-user': createCatalogue() })

    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).resolves.toMatchObject({ status: 'skipped' })

    expect(getAuthenticatedKiteClient).not.toHaveBeenCalled()
    expect(harness.upsertCalls).toHaveLength(0)
    expect(harness.staleUpdateCalls).toHaveLength(0)
  })

  it('enforces a thirty-second cooldown after every candidate fails', async () => {
    const harness = createSupabaseHarness({ candidates: [createCandidate('failing-user')] })
    mockCandidateCatalogues({ 'failing-user': new Error('Kite unavailable.') })

    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).rejects.toThrow('Every connected Kite candidate failed')
    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).resolves.toMatchObject({ status: 'skipped' })
    expect(getAuthenticatedKiteClient).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30 * 1000 + 1)
    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).rejects.toThrow('Every connected Kite candidate failed')
    expect(getAuthenticatedKiteClient).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['undersized', () => createCatalogue().slice(0, 9999)],
    ['malformed', () => {
      const catalogue = createCatalogue()
      catalogue[9999] = { ...catalogue[9999], last_price: Number.NaN } as Instrument
      return catalogue
    }],
    ['duplicate-key', () => {
      const catalogue = createCatalogue()
      catalogue[9999] = { ...catalogue[9999], tradingsymbol: catalogue[0]?.tradingsymbol } as Instrument
      return catalogue
    }],
  ])('rejects a %s catalogue before every write and stale update', async (_caseName, createInvalidCatalogue) => {
    const harness = createSupabaseHarness({ candidates: [createCandidate('invalid-user')] })
    mockCandidateCatalogues({ 'invalid-user': createInvalidCatalogue() })

    await expect(synchronizeInstrumentMaster(harness.supabase, {} as WorkerConfig)).rejects.toThrow('Every connected Kite candidate failed')

    expect(harness.upsertCalls).toHaveLength(0)
    expect(harness.staleUpdateCalls).toHaveLength(0)
  })
})
