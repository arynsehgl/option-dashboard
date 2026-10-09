/**
 * Regression tests for fail-fast worker configuration validation.
 * @module config.test
 */

import { describe, expect, it } from 'vitest'
import { isAllowedFrontendOrigin, parseWorkerConfig } from './config.js'

const requiredEnvironment = {
  NODE_ENV: 'production',
  FRONTEND_ORIGIN: 'https://example.com',
  PUBLIC_WORKER_URL: 'https://worker.example.com',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-with-safe-length',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  FIREBASE_PROJECT_ID: 'stride-production',
  FIREBASE_ALLOW_APPLICATION_DEFAULT: 'true',
}

describe('worker configuration', () => {
  it('defaults to trusting no reverse proxy hops', () => {
    expect(parseWorkerConfig(requiredEnvironment).trustProxyHops).toBe(0)
  })

  it('accepts a bounded explicit reverse proxy hop count', () => {
    expect(parseWorkerConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: '1' }).trustProxyHops).toBe(1)
  })

  it('rejects unsafe or malformed reverse proxy hop counts', () => {
    expect(() => parseWorkerConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: '-1' })).toThrow('TRUST_PROXY_HOPS')
    expect(() => parseWorkerConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: 'many' })).toThrow('TRUST_PROXY_HOPS')
    expect(() => parseWorkerConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: '11' })).toThrow('TRUST_PROXY_HOPS')
  })

  it('hard-rejects live mutation enablement in the paper-first V2 release', () => {
    expect(() => parseWorkerConfig({ ...requiredEnvironment, LIVE_ORDERING_ENABLED: 'true' })).toThrow('LIVE_ORDERING_ENABLED')
  })

  it('requires HTTPS service boundaries in production', () => {
    expect(() => parseWorkerConfig({ ...requiredEnvironment, PUBLIC_WORKER_URL: 'http://worker.example.com' })).toThrow('HTTPS')
  })

  it('requires explicit Firebase credentials as a complete pair', () => {
    expect(() => parseWorkerConfig({ ...requiredEnvironment, FIREBASE_CLIENT_EMAIL: 'worker@example.iam.gserviceaccount.com' })).toThrow('configured together')
  })

  it('rejects implicit Application Default Credentials in production', () => {
    const { FIREBASE_ALLOW_APPLICATION_DEFAULT: _allowApplicationDefault, ...environment } = requiredEnvironment
    expect(() => parseWorkerConfig(environment)).toThrow('explicit Firebase credentials')
    expect(() => parseWorkerConfig({ ...environment, FIREBASE_ALLOW_APPLICATION_DEFAULT: 'false' })).toThrow('FIREBASE_ALLOW_APPLICATION_DEFAULT=true')
  })

  it('accepts a complete explicit Firebase service-account pair without ADC opt-in', () => {
    const { FIREBASE_ALLOW_APPLICATION_DEFAULT: _allowApplicationDefault, ...environment } = requiredEnvironment
    const config = parseWorkerConfig({
      ...environment,
      FIREBASE_CLIENT_EMAIL: 'worker@example.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'x'.repeat(64),
    })
    expect(config.firebaseAllowApplicationDefault).toBe(false)
  })

  it('rejects encryption material that does not decode to 32 bytes', () => {
    expect(() => parseWorkerConfig({ ...requiredEnvironment, APP_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64') })).toThrow('32-byte key')
  })

  it('allows only exact configured or numeric site-scoped Netlify preview origins', () => {
    const config = parseWorkerConfig({ ...requiredEnvironment, NETLIFY_PREVIEW_SITE_NAME: 'myoptiontrade' })
    expect(isAllowedFrontendOrigin('https://example.com', config)).toBe(true)
    expect(isAllowedFrontendOrigin('https://deploy-preview-12--myoptiontrade.netlify.app', config)).toBe(true)
    expect(isAllowedFrontendOrigin('https://deploy-preview-12--other-site.netlify.app', config)).toBe(false)
    expect(isAllowedFrontendOrigin('https://evil.example.com', config)).toBe(false)
  })
})
