/**
 * Regression tests for the read-only Supabase connectivity and schema probe.
 * @module lib/supabase.test
 */

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseAdmin } from './supabase.js'
import { assertSupabaseAdminReady } from './supabase.js'

/** Builds the minimal RPC client used by the readiness boundary. */
function createProbeClient(data: unknown = true, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { client: { rpc } as unknown as SupabaseAdmin, rpc }
}

describe('Supabase Admin readiness', () => {
  it('requires the service-role runtime-guard marker to return true', async () => {
    const probe = createProbeClient()
    await expect(assertSupabaseAdminReady(probe.client)).resolves.toBeUndefined()
    expect(probe.rpc).toHaveBeenCalledWith('verify_stride_v2_runtime_guards')
  })

  it('propagates connectivity or schema failures', async () => {
    const probe = createProbeClient(null, { message: 'function does not exist' })
    await expect(assertSupabaseAdminReady(probe.client)).rejects.toThrow('Supabase readiness check failed')
    await expect(assertSupabaseAdminReady(createProbeClient(false).client)).rejects.toThrow('runtime guards are not ready')
  })
})
