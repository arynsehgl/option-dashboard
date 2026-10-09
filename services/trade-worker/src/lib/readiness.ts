/**
 * Single-flight dependency readiness cache for startup and public health checks.
 * @module lib/readiness
 */

export interface ReadinessCheckOptions {
  force?: boolean
}

export interface ReadinessCacheOptions {
  successTtlMs?: number
  failureTtlMs?: number
  now?: () => number
}

/**
 * Coalesces concurrent probes, caches successes briefly, and applies a shorter
 * sanitized negative cache so outage polling cannot amplify remote failures.
 */
export function createReadinessCache(
  probe: () => Promise<void>,
  { successTtlMs = 30_000, failureTtlMs = 5_000, now = Date.now }: ReadinessCacheOptions = {},
) {
  if (!Number.isFinite(successTtlMs) || successTtlMs <= 0) {
    throw new Error('Readiness success TTL must be a positive finite duration.')
  }
  if (!Number.isFinite(failureTtlMs) || failureTtlMs <= 0) {
    throw new Error('Readiness failure TTL must be a positive finite duration.')
  }
  let readyUntil = 0
  let failedUntil = 0
  let inFlight: Promise<void> | null = null
  const cachedFailure = new Error('Dependency readiness is temporarily unavailable.')

  return {
    /** Runs or reuses one readiness probe, optionally bypassing either cache. */
    async check({ force = false }: ReadinessCheckOptions = {}) {
      if (!force) {
        const checkedAt = now()
        if (readyUntil > checkedAt) return
        if (failedUntil > checkedAt) throw cachedFailure
      }
      if (inFlight) return inFlight
      const currentProbe = probe()
        .then(() => {
          readyUntil = now() + successTtlMs
          failedUntil = 0
        })
        .catch((error) => {
          readyUntil = 0
          failedUntil = now() + failureTtlMs
          throw error
        })
        .finally(() => {
          if (inFlight === currentProbe) inFlight = null
        })
      inFlight = currentProbe
      return currentProbe
    },
  }
}
