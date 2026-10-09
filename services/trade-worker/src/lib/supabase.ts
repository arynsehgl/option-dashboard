/** Creates the server-only Supabase client used for Trade Zone persistence. */
import { createClient } from '@supabase/supabase-js'
import type { WorkerConfig } from '../config.js'

/**
 * Creates the privileged server-only Supabase client used by the worker.
 */
export function createSupabaseAdmin(config: WorkerConfig) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

/**
 * Performs a read-only connectivity and exact runtime-guard probe through the
 * service-role-only marker created last by the V2 release migrations.
 */
export async function assertSupabaseAdminReady(supabase: SupabaseAdmin) {
  const { data, error } = await supabase.rpc('verify_stride_v2_runtime_guards')
  if (error) throw new Error('Supabase readiness check failed.', { cause: error })
  if (data !== true) throw new Error('Supabase runtime guards are not ready.')
}
