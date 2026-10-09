/**
 * Creates one active AI run per user with bounded crash recovery.
 * @module services/ai-runs
 */

import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseAdmin } from '../lib/supabase.js'

/** Maximum legitimate active-run age before a restarted worker may recover it. */
export const activeAiRunTimeoutMs = 30 * 60 * 1000

/** Input contract for one queued or running user-scoped AI phase. */
export interface ActiveAiRunInput {
  userId: string
  phase: 'morning_research' | 'open_revalidation'
  status: 'queued' | 'running'
  metadata?: Record<string, unknown>
}

/** Worker-held capability required to mutate one still-active AI run. */
export interface ActiveAiRunLease {
  id: string
  leaseToken: string
}

/** Atomic plan and terminal-state payload for one successful AI run. */
export interface FinalizeAiRunInput {
  status: 'completed' | 'no_trade'
  summary: string
  intentCount: number
  confidence: number
  invalidation: string
  evidenceIds: string[]
}

/** Raised when recovery or replacement has revoked a run's capability. */
export class AiRunLeaseExpiredError extends Error {
  /** Creates a stable non-secret lease failure for logs and callers. */
  constructor() {
    super('The AI run lease is no longer active.')
    this.name = 'AiRunLeaseExpiredError'
  }
}

/** Generates an unguessable worker capability and its database-safe hash. */
export function createAiRunLease() {
  const leaseToken = randomBytes(32).toString('base64url')
  return { leaseToken, leaseTokenHash: hashAiRunLease(leaseToken) }
}

/** Hashes a run capability so the raw token is never persisted. */
export function hashAiRunLease(leaseToken: string) {
  return createHash('sha256').update(leaseToken).digest('hex')
}

/**
 * Detects PostgreSQL uniqueness errors without depending on a PostgREST class.
 */
export function isPostgresUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === '23505'
}

/**
 * Marks abandoned queued/running rows failed after a conservative 30-minute
 * timeout so a prior process crash cannot permanently block future runs.
 */
export async function recoverStaleAiRuns(
  supabase: SupabaseAdmin,
  userId: string,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - activeAiRunTimeoutMs).toISOString()
  const replacementLease = createAiRunLease()
  const { error } = await supabase.from('ai_runs').update({
    status: 'failed',
    completed_at: now.toISOString(),
    error: 'Recovered after the worker found an active AI run older than 30 minutes.',
    lease_token_hash: replacementLease.leaseTokenHash,
  }).eq('user_id', userId).in('status', ['queued', 'running']).lt('started_at', cutoff)
  if (error) throw error
}

/**
 * Applies one run-state mutation only while the exact hashed lease remains in
 * an allowed active state; a recovered run returns false without overwriting it.
 */
export async function updateActiveAiRun(
  supabase: SupabaseAdmin,
  userId: string,
  run: ActiveAiRunLease,
  values: Record<string, unknown>,
  allowedStatuses: Array<'queued' | 'running'> = ['queued', 'running'],
) {
  const { data, error } = await supabase.from('ai_runs').update(values)
    .eq('id', run.id)
    .eq('user_id', userId)
    .eq('lease_token_hash', hashAiRunLease(run.leaseToken))
    .in('status', allowedStatuses)
    .select('id')
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/**
 * Persists an AI plan and terminal state together under the run-row lease lock,
 * preventing recovered work from polluting plans or overwriting its failure.
 */
export async function finalizeActiveAiRun(
  supabase: SupabaseAdmin,
  userId: string,
  run: ActiveAiRunLease,
  input: FinalizeAiRunInput,
) {
  const { error } = await supabase.rpc('finalize_ai_run', {
    p_user_id: userId,
    p_ai_run_id: run.id,
    p_ai_run_lease: run.leaseToken,
    p_status: input.status,
    p_summary: input.summary,
    p_intent_count: input.intentCount,
    p_confidence: input.confidence,
    p_invalidation: input.invalidation,
    p_evidence_ids: input.evidenceIds,
  })
  if (error) throw error
}

/**
 * Recovers abandoned work and atomically relies on the database partial unique
 * index to decide whether a new active run can be created.
 */
export async function createActiveAiRun(
  supabase: SupabaseAdmin,
  input: ActiveAiRunInput,
  now = new Date(),
) {
  await recoverStaleAiRuns(supabase, input.userId, now)
  const lease = createAiRunLease()
  const { data, error } = await supabase.from('ai_runs').insert({
    user_id: input.userId,
    phase: input.phase,
    status: input.status,
    started_at: now.toISOString(),
    metadata: input.metadata || {},
    lease_token_hash: lease.leaseTokenHash,
  }).select('id').single()
  if (isPostgresUniqueViolation(error)) return null
  if (error) throw error
  if (!data || typeof data.id !== 'string') throw new Error('AI run creation returned no identifier.')
  return { id: data.id, leaseToken: lease.leaseToken } as ActiveAiRunLease
}
