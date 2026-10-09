/**
 * Defines the authenticated browser boundary for Trade Worker reads and
 * guarded trading requests.
 */
import { auth, isFirebaseConfigured } from '../../config/firebase'
import { createPreviewCandles, getDisconnectedOverview, getPreviewOverview } from './demoData'

const workerUrl = (import.meta.env.VITE_TRADE_WORKER_URL || '').replace(/\/$/, '')

/**
 * Returns whether the browser has a configured Trade Worker endpoint.
 */
export function isTradeWorkerConfigured() {
  return Boolean(workerUrl)
}

/**
 * Returns the current Firebase ID token for server-side verification.
 */
async function getBearerToken(forceRefresh = false) {
  if (!isFirebaseConfigured || !auth?.currentUser) {
    throw new Error('Sign in with Firebase before opening Trade Zone.')
  }
  return auth.currentUser.getIdToken(forceRefresh)
}

/**
 * Sends an authenticated request to the Trade Worker and normalizes API errors.
 */
async function request(path, options = {}) {
  if (!workerUrl) throw new Error('Trade Worker is not configured')
  /** Sends one attempt while preserving caller-owned idempotency headers. */
  const send = async (forceRefresh = false) => {
    const token = await getBearerToken(forceRefresh)
    return fetch(`${workerUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
  }
  let response = await send()
  if (response.status === 401) response = await send(true)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Trade Worker request failed (${response.status})`)
  return payload.data ?? payload
}

/**
 * Loads the connected account overview or an explicitly selected local demo.
 */
export async function getTradeOverview(environment = 'paper', demo = false) {
  if (demo) return { ...getPreviewOverview(), environment }
  if (!workerUrl) return getDisconnectedOverview(environment)
  return request(`/api/v1/overview?environment=${encodeURIComponent(environment)}`)
}

/**
 * Loads historical candles for the selected instrument.
 */
export async function getInstrumentCandles(instrumentKey, interval = '15m', demo = false) {
  if (demo) return createPreviewCandles(instrumentKey)
  if (!workerUrl) return []
  return request(`/api/v1/market/candles?instrument=${encodeURIComponent(instrumentKey)}&interval=${encodeURIComponent(interval)}`)
}

/**
 * Fetches the server-generated Kite login redirect URL.
 */
export async function getKiteLoginUrl() {
  return request('/api/v1/kite/login-url')
}

/**
 * Sends personal Kite app credentials directly to the encrypted worker boundary.
 */
export async function saveKiteCredentials(credentials) {
  return request('/api/v1/broker/credentials', { method: 'POST', body: JSON.stringify(credentials) })
}

/**
 * Submits a confirmed live order with the ticket-owned retry identity.
 */
export async function submitLiveOrder(order, idempotencyKey) {
  if (!idempotencyKey) throw new Error('A stable idempotency key is required before submitting a live order.')
  return request('/api/v1/live/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey, 'X-User-Confirmed': 'true' },
    body: JSON.stringify(order),
  })
}

/**
 * Searches the worker's current Kite instrument master.
 */
export async function searchInstruments(query) {
  if (!workerUrl || !query.trim()) return []
  return request(`/api/v1/instruments?q=${encodeURIComponent(query.trim())}`)
}

/**
 * Adds one instrument to the authenticated user's persistent watchlist.
 */
export async function addWatchlistInstrument(instrumentKey) {
  return request('/api/v1/watchlist/items', { method: 'POST', body: JSON.stringify({ instrumentKey }) })
}

/**
 * Creates a live market stream using a short-lived ticket instead of a URL bearer token.
 */
export async function openMarketStream(instrumentTokens, onEvent, onStatus) {
  if (!workerUrl) return null
  const { ticket } = await request('/api/v1/stream-ticket', { method: 'POST' })
  const streamUrl = new URL('/api/v1/stream', workerUrl)
  streamUrl.protocol = streamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(streamUrl, ['stride', `ticket.${ticket}`])
  socket.addEventListener('open', () => {
    onStatus?.('connecting')
    socket.send(JSON.stringify({ type: 'subscribe', instrumentTokens, mode: 'quote' }))
  })
  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (payload.type === 'status' && payload.status) onStatus?.(payload.status)
      if (payload.type === 'error') onStatus?.('error')
      onEvent?.(payload)
    } catch { onStatus?.('invalid-message') }
  })
  socket.addEventListener('error', () => onStatus?.('error'))
  socket.addEventListener('close', () => onStatus?.('closed'))
  return socket
}

/**
 * Saves a versioned paper-only visual strategy.
 */
export async function savePaperStrategy(strategy) {
  if (!workerUrl) return { ...strategy, id: strategy.strategyId || crypto.randomUUID(), version: 1, status: strategy.activate ? 'active-demo' : 'draft-demo' }
  return request('/api/v1/strategies', { method: 'POST', body: JSON.stringify(strategy) })
}

/**
 * Requests a guarded AI research run in the paper environment.
 */
export async function startAiResearchRun(demo = false) {
  if (demo) return { id: crypto.randomUUID(), status: 'demo', message: 'Demo research acknowledged; no agent or order engine was called.' }
  if (!workerUrl) throw new Error('Trade Worker is required before AI research can run.')
  return request('/api/v1/ai/runs', { method: 'POST', body: JSON.stringify({ environment: 'paper' }) })
}
