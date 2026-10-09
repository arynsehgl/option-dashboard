/**
 * Public HTTP abuse-control settings kept independent for contract testing.
 * @module http-security
 */

/** Tight limiter for the unauthenticated, database-backed Kite callback. */
export const kiteCallbackRateLimitOptions = {
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
}

interface SerializableHttpRequest {
  id?: unknown
  method?: unknown
  url?: unknown
  headers?: unknown
  remoteAddress?: unknown
  remotePort?: unknown
}

/**
 * Serializes only non-secret request metadata and strips the complete query
 * string before Pino receives it, protecting OAuth tokens and callback state.
 */
export function serializeHttpRequestForLog(request: SerializableHttpRequest) {
  const rawUrl = typeof request.url === 'string' ? request.url : '/'
  let pathname = '/'
  try {
    pathname = new URL(rawUrl, 'http://stride-worker.invalid').pathname
  } catch {
    pathname = rawUrl.split(/[?#]/, 1)[0] || '/'
  }
  return {
    id: request.id,
    method: request.method,
    url: pathname,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  }
}
