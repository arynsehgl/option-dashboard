/**
 * Regression tests for unauthenticated callback abuse-control settings.
 * @module http-security.test
 */

import { describe, expect, it } from 'vitest'
import { kiteCallbackRateLimitOptions, serializeHttpRequestForLog } from './http-security.js'

describe('Kite callback rate limit', () => {
  it('bounds every source address to 30 callback attempts per minute', () => {
    expect(kiteCallbackRateLimitOptions).toMatchObject({ windowMs: 60_000, limit: 30, legacyHeaders: false })
  })
})

describe('HTTP request log serialization', () => {
  it('never serializes callback query secrets or request headers', () => {
    const serialized = serializeHttpRequestForLog({
      id: 'request-1',
      method: 'GET',
      url: '/api/v1/kite/callback?request_token=oauth-secret&state=state-secret',
      remoteAddress: '127.0.0.1',
      remotePort: 443,
      headers: { authorization: 'Bearer firebase-secret' },
    })
    const output = JSON.stringify(serialized)

    expect(serialized.url).toBe('/api/v1/kite/callback')
    expect(output).not.toContain('oauth-secret')
    expect(output).not.toContain('state-secret')
    expect(output).not.toContain('firebase-secret')
    expect(output).not.toContain('request_token')
  })
})
