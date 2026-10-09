/** Persists immutable Trade Zone audit events through the privileged worker client. */
import type { SupabaseAdmin } from '../lib/supabase.js'

/**
 * Persists a redacted, append-only user audit event.
 */
export async function writeAuditEvent(
  supabase: SupabaseAdmin,
  userId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from('audit_events').insert({
    user_id: userId,
    event_type: eventType,
    summary,
    metadata,
  })
  if (error) throw error
}
