/** Validates and synchronizes the global Kite instrument catalogue into persistence. */
import type { Instrument } from 'kiteconnect'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getAuthenticatedKiteClient } from './broker.js'

const upsertBatchSize = 1000
const minimumCatalogueSize = 10000
const maximumCandidateCount = 20
const successCooldownMs = 5 * 60 * 1000
const failureCooldownMs = 30 * 1000

interface BrokerCandidate {
  user_id: string
  token_expires_at: string
  updated_at: string
}

interface NormalizedInstrument {
  instrument_key: string
  instrument_token: number
  exchange_token: number | null
  exchange: string
  tradingsymbol: string
  name: string | null
  last_price: number
  expiry: string | null
  strike: number
  tick_size: number
  lot_size: number
  instrument_type: string | null
  segment: string | null
  is_active: true
  refreshed_at: string
}

export type InstrumentRefreshResult =
  | { status: 'refreshed'; count: number; refreshedAt: string }
  | { status: 'skipped'; reason: string }

let refreshInFlight: Promise<InstrumentRefreshResult> | null = null
let localCooldownUntil = 0
let localCooldownKind: 'success' | 'failure' | null = null

/**
 * Converts a required catalogue field to a finite number and rejects malformed
 * upstream rows before any database mutation can begin.
 */
function requireFiniteNumber(value: unknown, field: string, index: number, options: { integer?: boolean; positive?: boolean; nonnegative?: boolean } = {}) {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(parsed)
    || (options.integer && !Number.isInteger(parsed))
    || (options.positive && parsed <= 0)
    || (options.nonnegative && parsed < 0)) {
    throw new Error(`Kite instrument catalogue row ${index} has an invalid ${field}.`)
  }
  return parsed
}

/**
 * Validates a required non-empty catalogue string without accepting control
 * characters that could produce ambiguous global instrument keys.
 */
function requireCatalogueString(value: unknown, field: string, index: number, maximumLength: number) {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > maximumLength
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`Kite instrument catalogue row ${index} has an invalid ${field}.`)
  }
  return value
}

/**
 * Converts an optional text field to its bounded persistence form and rejects
 * unexpected runtime types instead of silently stringifying them.
 */
function normalizeOptionalString(value: unknown, field: string, index: number, maximumLength: number) {
  if (value === null || value === undefined || value === '') return null
  return requireCatalogueString(value, field, index, maximumLength)
}

/**
 * Converts an optional Kite expiry to an ISO calendar date while rejecting an
 * invalid Date object or an unexpected response representation.
 */
function normalizeExpiry(value: unknown, index: number) {
  if (value === null || value === undefined || value === '') return null
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Kite instrument catalogue row ${index} has an invalid expiry.`)
  }
  return value.toISOString().slice(0, 10)
}

/**
 * Validates and normalizes the complete upstream catalogue in memory. The
 * minimum-size and duplicate-key guards make validation an all-or-nothing gate.
 */
export function validateInstrumentCatalogue(instruments: readonly Instrument[], refreshedAt: string) {
  if (!Array.isArray(instruments) || instruments.length < minimumCatalogueSize) {
    throw new Error(`Kite instrument catalogue is undersized; expected at least ${minimumCatalogueSize} rows.`)
  }
  const instrumentKeys = new Set<string>()
  return instruments.map((instrument, index): NormalizedInstrument => {
    if (!instrument || typeof instrument !== 'object') {
      throw new Error(`Kite instrument catalogue row ${index} is malformed.`)
    }
    const exchange = requireCatalogueString(instrument.exchange, 'exchange', index, 16)
    const tradingsymbol = requireCatalogueString(instrument.tradingsymbol, 'tradingsymbol', index, 128)
    const instrumentKey = `${exchange}:${tradingsymbol}`
    if (instrumentKeys.has(instrumentKey)) {
      throw new Error(`Kite instrument catalogue contains duplicate key ${instrumentKey}.`)
    }
    instrumentKeys.add(instrumentKey)
    const parsedExchangeToken = instrument.exchange_token === null || instrument.exchange_token === undefined
      ? 0
      : requireFiniteNumber(instrument.exchange_token, 'exchange_token', index, { integer: true, nonnegative: true })
    return {
      instrument_key: instrumentKey,
      instrument_token: requireFiniteNumber(instrument.instrument_token, 'instrument_token', index, { integer: true, positive: true }),
      exchange_token: parsedExchangeToken === 0 ? null : parsedExchangeToken,
      exchange,
      tradingsymbol,
      name: normalizeOptionalString(instrument.name, 'name', index, 256),
      last_price: requireFiniteNumber(instrument.last_price, 'last_price', index, { nonnegative: true }),
      expiry: normalizeExpiry(instrument.expiry, index),
      strike: requireFiniteNumber(instrument.strike, 'strike', index, { nonnegative: true }),
      tick_size: requireFiniteNumber(instrument.tick_size, 'tick_size', index, { nonnegative: true }),
      lot_size: requireFiniteNumber(instrument.lot_size, 'lot_size', index, { integer: true, positive: true }),
      instrument_type: normalizeOptionalString(instrument.instrument_type, 'instrument_type', index, 32),
      segment: normalizeOptionalString(instrument.segment, 'segment', index, 32),
      is_active: true,
      refreshed_at: refreshedAt,
    }
  })
}

/**
 * Loads only connected, unexpired Kite sessions and puts a just-verified OAuth
 * callback user first while retaining deterministic bounded failover ordering.
 */
async function loadBrokerCandidates(supabase: SupabaseAdmin, preferredUserId?: string) {
  const now = new Date().toISOString()
  const preferredResult = preferredUserId
    ? await supabase
      .from('broker_connections')
      .select('user_id,token_expires_at,updated_at')
      .eq('broker', 'kite')
      .eq('status', 'connected')
      .eq('user_id', preferredUserId)
      .gt('token_expires_at', now)
      .maybeSingle<BrokerCandidate>()
    : { data: null, error: null }
  if (preferredResult.error) throw preferredResult.error

  const { data, error } = await supabase
    .from('broker_connections')
    .select('user_id,token_expires_at,updated_at')
    .eq('broker', 'kite')
    .eq('status', 'connected')
    .gt('token_expires_at', now)
    .order('updated_at', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(maximumCandidateCount)
  if (error) throw error

  const ordered = [preferredResult.data, ...((data || []) as BrokerCandidate[])]
  const unique = new Map<string, BrokerCandidate>()
  for (const candidate of ordered) {
    if (candidate?.user_id && !unique.has(candidate.user_id)) unique.set(candidate.user_id, candidate)
  }
  return Array.from(unique.values()).slice(0, maximumCandidateCount)
}

/**
 * Uses the oldest active row as an authoritative completion marker: a complete
 * refresh stamps every active row together, while partial batch writes leave an
 * older active timestamp and therefore cannot trigger the success cooldown.
 */
async function getAuthoritativeCooldownUntil(supabase: SupabaseAdmin) {
  const { data, error } = await supabase
    .from('instruments')
    .select('refreshed_at')
    .eq('is_active', true)
    .order('refreshed_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ refreshed_at: string }>()
  if (error) throw error
  if (!data?.refreshed_at) return 0
  const refreshedAt = new Date(data.refreshed_at).getTime()
  return Number.isFinite(refreshedAt) ? refreshedAt + successCooldownMs : 0
}

/**
 * Tries a bounded ordered set of independently authenticated users until Kite
 * returns one fully valid global catalogue; no persistence occurs on failures.
 */
async function fetchValidatedCatalogue(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  candidates: BrokerCandidate[],
  refreshedAt: string,
) {
  const failures: unknown[] = []
  for (const candidate of candidates) {
    try {
      const { kite } = await getAuthenticatedKiteClient(supabase, config, candidate.user_id)
      const instruments = await kite.getInstruments()
      return validateInstrumentCatalogue(instruments, refreshedAt)
    } catch (error) {
      failures.push(error)
    }
  }
  throw new AggregateError(failures, 'Every connected Kite candidate failed to provide a valid instrument catalogue.')
}

/**
 * Persists a completely validated catalogue and marks stale rows only after
 * every upsert batch succeeds, preserving existing active data on fetch errors.
 */
async function persistValidatedCatalogue(supabase: SupabaseAdmin, normalized: NormalizedInstrument[], refreshedAt: string) {
  for (let index = 0; index < normalized.length; index += upsertBatchSize) {
    const { error } = await supabase
      .from('instruments')
      .upsert(normalized.slice(index, index + upsertBatchSize), { onConflict: 'instrument_key' })
    if (error) throw error
  }

  const { error: staleError } = await supabase
    .from('instruments')
    .update({ is_active: false })
    .lt('refreshed_at', refreshedAt)
    .eq('is_active', true)
  if (staleError) throw staleError
}

/**
 * Runs one uncached refresh attempt after checking the database-backed success
 * cooldown, then uses preferred-first bounded failover and all-or-nothing input validation.
 */
async function performInstrumentRefresh(supabase: SupabaseAdmin, config: WorkerConfig, preferredUserId?: string): Promise<InstrumentRefreshResult> {
  const authoritativeCooldownUntil = await getAuthoritativeCooldownUntil(supabase)
  if (authoritativeCooldownUntil > Date.now()) {
    localCooldownUntil = authoritativeCooldownUntil
    localCooldownKind = 'success'
    return { status: 'skipped', reason: 'The global instrument catalogue was refreshed recently.' }
  }

  const candidates = await loadBrokerCandidates(supabase, preferredUserId)
  if (candidates.length === 0) {
    return { status: 'skipped', reason: 'No connected, unexpired Kite session is available for the global refresh.' }
  }

  const refreshedAt = new Date().toISOString()
  const normalized = await fetchValidatedCatalogue(supabase, config, candidates, refreshedAt)
  await persistValidatedCatalogue(supabase, normalized, refreshedAt)
  return { status: 'refreshed', count: normalized.length, refreshedAt }
}

/**
 * Refreshes the global Kite instrument master with process-wide single-flight,
 * a five-minute success cooldown, and a thirty-second failure cooldown.
 */
export function synchronizeInstrumentMaster(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  preferredUserId?: string,
): Promise<InstrumentRefreshResult> {
  if (refreshInFlight) return refreshInFlight
  if (localCooldownUntil > Date.now()) {
    return Promise.resolve({
      status: 'skipped',
      reason: localCooldownKind === 'success'
        ? 'The global instrument catalogue was refreshed recently.'
        : 'The global instrument catalogue refresh is cooling down after a failure.',
    })
  }

  const attempt = performInstrumentRefresh(supabase, config, preferredUserId)
    .then((result) => {
      if (result.status === 'refreshed') {
        localCooldownUntil = Date.now() + successCooldownMs
        localCooldownKind = 'success'
      } else if (localCooldownKind !== 'success') {
        localCooldownUntil = Date.now() + failureCooldownMs
        localCooldownKind = 'failure'
      }
      return result
    })
    .catch((error) => {
      localCooldownUntil = Date.now() + failureCooldownMs
      localCooldownKind = 'failure'
      throw error
    })
    .finally(() => {
      if (refreshInFlight === attempt) refreshInFlight = null
    })
  refreshInFlight = attempt
  return attempt
}

/** Clears module coordination state so focused tests remain independent. */
export function resetInstrumentRefreshCoordinatorForTests() {
  refreshInFlight = null
  localCooldownUntil = 0
  localCooldownKind = null
}
