/** Manages encrypted Kite credentials, OAuth state, sessions, and connection status. */
import { createHash, randomBytes } from 'node:crypto'
import { KiteConnect } from 'kiteconnect'
import type { WorkerConfig } from '../config.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import type { BrokerSecrets } from '../types.js'
import { writeAuditEvent } from './audit.js'

interface BrokerConnectionRow {
  api_key_cipher: string
  api_secret_cipher: string
  access_token_cipher: string | null
  broker_user_id: string | null
  token_expires_at: string | null
  status: string
}

/**
 * Calculates the next 6 AM Asia/Kolkata session-expiry boundary.
 */
function nextSixAmIst() {
  const offsetMs = 330 * 60 * 1000
  const nowUtc = Date.now()
  const istNow = new Date(nowUtc + offsetMs)
  const boundaryAsUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 6, 0, 0)
  const nextBoundaryAsIstClock = boundaryAsUtc <= istNow.getTime() ? boundaryAsUtc + 86400000 : boundaryAsUtc
  return new Date(nextBoundaryAsIstClock - offsetMs).toISOString()
}

/**
 * Stores a user's personal Kite app credentials encrypted at the application boundary.
 */
export async function saveBrokerCredentials(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  userId: string,
  apiKey: string,
  apiSecret: string,
) {
  const { error } = await supabase.from('broker_connections').upsert({
    user_id: userId,
    broker: 'kite',
    api_key_cipher: encryptSecret(apiKey, config.APP_ENCRYPTION_KEY),
    api_secret_cipher: encryptSecret(apiSecret, config.APP_ENCRYPTION_KEY),
    access_token_cipher: null,
    broker_user_id: null,
    token_expires_at: null,
    status: 'credentials_saved',
  }, { onConflict: 'user_id,broker' })
  if (error) throw error
  await writeAuditEvent(supabase, userId, 'BROKER_CREDENTIALS_SAVED', 'Kite application credentials were replaced; prior session invalidated.')
}

/**
 * Loads and decrypts one user's broker material on the server only.
 */
export async function getBrokerSecrets(supabase: SupabaseAdmin, config: WorkerConfig, userId: string): Promise<BrokerSecrets> {
  const { data, error } = await supabase
    .from('broker_connections')
    .select('api_key_cipher,api_secret_cipher,access_token_cipher,broker_user_id,token_expires_at,status')
    .eq('user_id', userId)
    .eq('broker', 'kite')
    .maybeSingle<BrokerConnectionRow>()
  if (error) throw error
  if (!data) throw new Error('Kite application credentials are not configured for this user.')
  return {
    apiKey: decryptSecret(data.api_key_cipher, config.APP_ENCRYPTION_KEY),
    apiSecret: decryptSecret(data.api_secret_cipher, config.APP_ENCRYPTION_KEY),
    accessToken: data.access_token_cipher ? decryptSecret(data.access_token_cipher, config.APP_ENCRYPTION_KEY) : undefined,
    brokerUserId: data.broker_user_id || undefined,
    tokenExpiresAt: data.token_expires_at || undefined,
  }
}

/**
 * Returns a user-bound Kite client and rejects expired or absent sessions.
 */
export async function getAuthenticatedKiteClient(supabase: SupabaseAdmin, config: WorkerConfig, userId: string) {
  const secrets = await getBrokerSecrets(supabase, config, userId)
  if (!secrets.accessToken || !secrets.tokenExpiresAt || new Date(secrets.tokenExpiresAt) <= new Date()) {
    throw new Error('Kite login is required for today.')
  }
  const kite = new KiteConnect({ api_key: secrets.apiKey })
  kite.setAccessToken(secrets.accessToken)
  return { kite, secrets }
}

/**
 * Builds a Kite login URL carrying a short-lived signed user binding.
 */
export async function createBrokerLoginUrl(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  userId: string,
  returnOrigin: string,
) {
  const secrets = await getBrokerSecrets(supabase, config, userId)
  const kite = new KiteConnect({ api_key: secrets.apiKey })
  const state = randomBytes(32).toString('base64url')
  const stateHash = createHash('sha256').update(state).digest('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error } = await supabase.from('broker_oauth_states').insert({
    user_id: userId,
    state_hash: stateHash,
    return_origin: returnOrigin,
    expires_at: expiresAt,
  })
  if (error) throw error
  const redirectParams = encodeURIComponent(`state=${state}`)
  return `${kite.getLoginURL()}&redirect_params=${redirectParams}`
}

/**
 * Atomically consumes a random OAuth state so callback replay cannot replace a
 * user's daily Kite session or redirect to an untrusted browser origin.
 */
export async function consumeBrokerLoginState(supabase: SupabaseAdmin, state: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('Invalid broker login state')
  const stateHash = createHash('sha256').update(state).digest('hex')
  const { data, error } = await supabase.rpc('consume_broker_oauth_state', { p_state_hash: stateHash })
  if (error) throw error
  const consumed = Array.isArray(data) ? data[0] : data
  const profileId = consumed?.profile_id
  const returnOrigin = consumed?.redirect_origin
  if (!profileId || !returnOrigin) throw new Error('Broker login state is invalid, expired, or already used')
  return { userId: String(profileId), returnOrigin: String(returnOrigin) }
}

/**
 * Exchanges a one-time Kite request token and persists only its encrypted session output.
 */
export async function completeBrokerLogin(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  userId: string,
  requestToken: string,
) {
  const secrets = await getBrokerSecrets(supabase, config, userId)
  const kite = new KiteConnect({ api_key: secrets.apiKey })
  const session = await kite.generateSession(requestToken, secrets.apiSecret)
  const tokenExpiresAt = nextSixAmIst()
  const { error } = await supabase.from('broker_connections').update({
    access_token_cipher: encryptSecret(session.access_token, config.APP_ENCRYPTION_KEY),
    broker_user_id: session.user_id,
    token_expires_at: tokenExpiresAt,
    status: 'connected',
  }).eq('user_id', userId).eq('broker', 'kite')
  if (error) throw error
  await writeAuditEvent(supabase, userId, 'BROKER_SESSION_CONNECTED', 'Daily Kite session established.', {
    brokerUserId: session.user_id,
    tokenExpiresAt,
  })
  return { userId: session.user_id, tokenExpiresAt }
}

/**
 * Returns a non-secret connection status suitable for the browser.
 */
export async function getBrokerStatus(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase.from('broker_connections').select('status,broker_user_id,token_expires_at').eq('user_id', userId).eq('broker', 'kite').maybeSingle()
  if (error) throw error
  const connected = Boolean(data?.token_expires_at && new Date(data.token_expires_at) > new Date() && data.status === 'connected')
  return {
    status: connected ? 'connected' : data ? 'disconnected' : 'not_configured',
    label: connected ? 'Kite connected' : data ? 'Kite login required' : 'Kite app not configured',
    brokerUserId: data?.broker_user_id || null,
    sessionExpiresAt: connected ? data?.token_expires_at : null,
  }
}
