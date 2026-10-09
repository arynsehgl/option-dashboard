/**
 * Verifies that Kite OAuth state is random, hashed at rest, origin-bound, and
 * consumed through the database's atomic one-time RPC.
 * @module services/broker-state.test
 */

import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import { encryptSecret } from '../lib/crypto.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { consumeBrokerLoginState, createBrokerLoginUrl } from './broker.js'

const encryptionKey = Buffer.alloc(32, 9).toString('base64')

/**
 * Creates a narrow Supabase double for credential lookup and OAuth-state insert.
 */
function createBrokerSupabase() {
  const insertedStates: Array<Record<string, unknown>> = []
  const credentialQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        api_key_cipher: encryptSecret('kite-api-key', encryptionKey),
        api_secret_cipher: encryptSecret('kite-api-secret', encryptionKey),
        access_token_cipher: null,
        broker_user_id: null,
        token_expires_at: null,
        status: 'credentials_saved',
      },
      error: null,
    }),
  }
  credentialQuery.select.mockReturnValue(credentialQuery)
  credentialQuery.eq.mockReturnValue(credentialQuery)
  const supabase = {
    from: vi.fn((table: string) => table === 'broker_connections'
      ? credentialQuery
      : { insert: vi.fn(async (row: Record<string, unknown>) => { insertedStates.push(row); return { error: null } }) }),
    rpc: vi.fn(),
  } as unknown as SupabaseAdmin
  return { supabase, insertedStates }
}

describe('Kite OAuth state', () => {
  it('stores only a hash and binds the callback to the validated browser origin', async () => {
    const { supabase, insertedStates } = createBrokerSupabase()
    const config = { APP_ENCRYPTION_KEY: encryptionKey } as WorkerConfig
    const url = await createBrokerLoginUrl(supabase, config, '31a7415b-b537-4d37-94eb-724df8cb33a4', 'https://myoptiontrade.netlify.app')
    const redirectParams = new URL(url).searchParams.get('redirect_params') || ''
    const state = new URLSearchParams(redirectParams).get('state') || ''
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(insertedStates).toHaveLength(1)
    expect(insertedStates[0]).toMatchObject({
      state_hash: createHash('sha256').update(state).digest('hex'),
      return_origin: 'https://myoptiontrade.netlify.app',
    })
    expect(JSON.stringify(insertedStates[0])).not.toContain(state)
  })

  it('returns only an atomically consumed state and rejects malformed input', async () => {
    const state = Buffer.alloc(32, 4).toString('base64url')
    const rpc = vi.fn().mockResolvedValue({
      data: [{ profile_id: '31a7415b-b537-4d37-94eb-724df8cb33a4', redirect_origin: 'https://myoptiontrade.netlify.app' }],
      error: null,
    })
    const supabase = { rpc } as unknown as SupabaseAdmin
    await expect(consumeBrokerLoginState(supabase, state)).resolves.toEqual({
      userId: '31a7415b-b537-4d37-94eb-724df8cb33a4',
      returnOrigin: 'https://myoptiontrade.netlify.app',
    })
    expect(rpc).toHaveBeenCalledWith('consume_broker_oauth_state', {
      p_state_hash: createHash('sha256').update(state).digest('hex'),
    })
    await expect(consumeBrokerLoginState(supabase, 'invalid')).rejects.toThrow('Invalid broker login state')
  })
})
