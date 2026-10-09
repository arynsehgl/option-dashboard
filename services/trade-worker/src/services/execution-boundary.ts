/**
 * Central, deterministic policy for broker-mutating HTTP routes.
 * @module services/execution-boundary
 */

export interface LiveExecutionGate {
  allowed: boolean
  status: number
  error?: string
}

/**
 * Requires both a deployment kill-switch and a fresh human confirmation.
 */
export function evaluateLiveExecutionGate(liveOrderingEnabled: boolean, userConfirmed: boolean): LiveExecutionGate {
  if (!liveOrderingEnabled) return { allowed: false, status: 403, error: 'Live ordering is disabled at the worker level.' }
  if (!userConfirmed) return { allowed: false, status: 400, error: 'Explicit user confirmation is required for this live broker action.' }
  return { allowed: true, status: 200 }
}
