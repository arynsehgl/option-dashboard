/**
 * Serves authenticated, origin-restricted Kite market streams over WebSockets.
 * @module services/market-stream
 */
import type { IncomingMessage, Server } from 'node:http'
import { KiteTicker, type Tick } from 'kiteconnect'
import type { Logger } from 'pino'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { isAllowedFrontendOrigin, type WorkerConfig } from '../config.js'
import { verifySignedState } from '../lib/crypto.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getBrokerSecrets } from './broker.js'
import { writeAuditEvent } from './audit.js'

export const MAX_STREAM_INSTRUMENT_TOKENS = 100
export const MAX_STREAM_BUFFERED_BYTES = 256 * 1024

const subscriptionSchema = z.object({
  type: z.literal('subscribe'),
  instrumentTokens: z.array(z.number().int().positive()).max(MAX_STREAM_INSTRUMENT_TOKENS),
  mode: z.enum(['ltp', 'quote', 'full']).default('quote'),
}).strict()

export const MARKET_STREAM_SESSION_TTL_MS = 5 * 60 * 1000

interface StreamSessionExpiry {
  clear(): void
}

interface BrowserStreamClient {
  socket: WebSocket
  instrumentTokens: Set<number>
  mode: 'ltp' | 'quote' | 'full'
  sessionExpiry: StreamSessionExpiry
  subscriptionAccepted: boolean
}

interface UserTickerHub {
  clients: Set<BrowserStreamClient>
  subscribedTokens: Set<number>
  ticker: InstanceType<typeof KiteTicker>
  heartbeatTimer?: NodeJS.Timeout
  lastBrokerTickAt: string | null
}

/**
 * Coalesces concurrent per-key resource creation while allowing retries after a
 * rejected creation attempt.
 */
export function createSingleFlightLoader<Key, Value>(
  readExisting: (key: Key) => Value | undefined,
  createValue: (key: Key) => Promise<Value>,
) {
  const pending = new Map<Key, Promise<Value>>()
  return async function loadSingleFlight(key: Key) {
    const existing = readExisting(key)
    if (existing !== undefined) return existing
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    const creation = createValue(key)
    pending.set(key, creation)
    try {
      return await creation
    } finally {
      if (pending.get(key) === creation) pending.delete(key)
    }
  }
}

/**
 * Creates a fixed-lifetime browser stream lease so every long-running session
 * must periodically obtain a newly Firebase-authorized stream ticket.
 */
export function createStreamSessionExpiry(
  expireSession: () => void,
  ttlMs = MARKET_STREAM_SESSION_TTL_MS,
): StreamSessionExpiry {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Market-stream session TTL must be positive.')
  let active = true
  const timer = setTimeout(() => {
    if (!active) return
    active = false
    expireSession()
  }, ttlMs)
  timer.unref()
  return {
    /** Cancels the lease timer after normal close or worker shutdown. */
    clear() {
      if (!active) return
      active = false
      clearTimeout(timer)
    },
  }
}

/** Parses one bounded browser subscription without mutating broker state. */
export function parseMarketSubscription(rawMessage: string) {
  return subscriptionSchema.parse(JSON.parse(rawMessage))
}

/**
 * Sends one compact JSON event while enforcing a bounded outbound buffer.
 * Slow consumers are closed rather than retaining an unbounded quote backlog.
 */
export function sendStreamEvent(
  socket: WebSocket,
  event: unknown,
  maxBufferedBytes = MAX_STREAM_BUFFERED_BYTES,
) {
  if (socket.readyState !== WebSocket.OPEN) return false
  const serialized = JSON.stringify(event)
  if (socket.bufferedAmount + Buffer.byteLength(serialized) > maxBufferedBytes) {
    socket.close(1013, 'Market stream consumer is too slow')
    return false
  }
  socket.send(serialized)
  return true
}

/** Sends a compact JSON event through the bounded stream writer. */
function sendEvent(socket: WebSocket, event: unknown) {
  sendStreamEvent(socket, event)
}

/**
 * Returns the short-lived stream ticket carried in the WebSocket subprotocol header.
 */
function readStreamTicket(request: IncomingMessage) {
  const protocols = String(request.headers['sec-websocket-protocol'] || '').split(',').map((value) => value.trim())
  return protocols.find((protocol) => protocol.startsWith('ticket.'))?.slice('ticket.'.length) || ''
}

/**
 * Reconciles one Kite ticker subscription with the union requested by its browser clients.
 */
export function reconcileHub(hub: UserTickerHub) {
  const requestedTokens = new Set(Array.from(hub.clients).flatMap((client) => Array.from(client.instrumentTokens)))
  if (!hub.ticker.connected()) return
  const additions = Array.from(requestedTokens).filter((token) => !hub.subscribedTokens.has(token))
  const removals = Array.from(hub.subscribedTokens).filter((token) => !requestedTokens.has(token))
  if (additions.length) hub.ticker.subscribe(additions)
  if (removals.length) hub.ticker.unsubscribe(removals)
  for (const client of hub.clients) {
    const tokens = Array.from(client.instrumentTokens)
    if (tokens.length) hub.ticker.setMode(client.mode, tokens)
  }
  hub.subscribedTokens = requestedTokens
}

/** Resets transport-local subscription bookkeeping before every broker connect. */
export function reconcileConnectedHub(hub: UserTickerHub) {
  hub.subscribedTokens.clear()
  reconcileHub(hub)
}

/**
 * Invalidates transport-local subscription state and tells every browser that
 * broker data is unavailable until Kite emits a fresh connect event.
 */
export function markHubBrokerReconnecting(hub: UserTickerHub) {
  hub.subscribedTokens.clear()
  for (const client of hub.clients) {
    sendEvent(client.socket, { type: 'status', status: 'reconnecting' })
  }
}

/**
 * Applies the single immutable subscription allowed for one browser session.
 * Token changes use a new short-lived authorized socket instead of churn.
 */
export function applyInitialMarketSubscription(
  client: BrowserStreamClient,
  hub: UserTickerHub,
  rawMessage: string,
) {
  if (client.subscriptionAccepted) throw new Error('Market-stream subscription is already set.')
  const message = parseMarketSubscription(rawMessage)
  client.instrumentTokens = new Set(message.instrumentTokens)
  client.mode = message.mode
  client.subscriptionAccepted = true
  reconcileHub(hub)
  return message
}

/**
 * Fans broker ticks out only to browser sessions that subscribed to each instrument.
 */
function broadcastTicks(hub: UserTickerHub, ticks: Tick[]) {
  const receivedAt = new Date().toISOString()
  hub.lastBrokerTickAt = receivedAt
  for (const client of hub.clients) {
    const selectedTicks = ticks.filter((tick) => client.instrumentTokens.has(tick.instrument_token))
    if (selectedTicks.length) sendEvent(client.socket, { type: 'ticks', data: selectedTicks, receivedAt })
  }
}

/**
 * Emits a server heartbeat so quiet instruments are not mistaken for a dead feed.
 */
function broadcastHeartbeat(hub: UserTickerHub) {
  const serverTime = new Date().toISOString()
  for (const client of hub.clients) {
    sendEvent(client.socket, {
      type: 'heartbeat',
      data: { serverTime, marketDataConnected: hub.ticker.connected(), lastBrokerTickAt: hub.lastBrokerTickAt },
    })
  }
}

/**
 * Reconciles asynchronous Kite order updates into the local order and audit records.
 */
async function persistOrderUpdate(supabase: SupabaseAdmin, userId: string, order: Record<string, unknown>) {
  const brokerOrderId = String(order.order_id || '')
  if (!brokerOrderId) return
  const { data, error } = await supabase.from('orders').update({
    status: String(order.status || 'unknown').toLowerCase(),
    status_message: order.status_message ? String(order.status_message) : null,
    average_price: Number(order.average_price || 0) || null,
  }).eq('user_id', userId).eq('broker_order_id', brokerOrderId).select('id').maybeSingle()
  if (error) throw error
  if (data) await writeAuditEvent(supabase, userId, 'LIVE_ORDER_STATUS_UPDATED', 'Kite pushed a new broker order status.', { orderId: data.id, brokerOrderId, status: order.status })
}

/**
 * Attaches an authenticated WebSocket gateway while maintaining one KiteTicker per user.
 */
export function attachMarketStreamServer(
  server: Server,
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  logger: Logger,
) {
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    handleProtocols: (protocols) => protocols.has('stride') ? 'stride' : false,
  })
  const hubs = new Map<string, UserTickerHub>()
  let shuttingDown = false

  websocketServer.on('error', (error) => {
    logger.error({ err: error }, 'Market WebSocket server error')
  })

  /**
   * Disconnects one user hub and removes it only when it is still current.
   */
  function closeUserHub(userId: string, hub: UserTickerHub) {
    if (hub.heartbeatTimer) clearInterval(hub.heartbeatTimer)
    try {
      hub.ticker.disconnect()
    } catch (error) {
      logger.warn({ err: error, userId }, 'Kite market stream cleanup failed')
    } finally {
      if (hubs.get(userId) === hub) hubs.delete(userId)
    }
  }

  /**
   * Creates a user's broker stream and wires bounded, redacted lifecycle events.
   */
  async function createUserHub(userId: string) {
    if (shuttingDown) throw new Error('The market-stream service is shutting down.')
    const secrets = await getBrokerSecrets(supabase, config, userId)
    if (shuttingDown) throw new Error('The market-stream service is shutting down.')
    if (!secrets.accessToken || !secrets.tokenExpiresAt || new Date(secrets.tokenExpiresAt) <= new Date()) {
      throw new Error('Kite login is required for today.')
    }
    const ticker = new KiteTicker({ api_key: secrets.apiKey, access_token: secrets.accessToken, reconnect: true, max_retry: 20, max_delay: 30 })
    const hub: UserTickerHub = {
      clients: new Set<BrowserStreamClient>(),
      subscribedTokens: new Set<number>(),
      ticker,
      lastBrokerTickAt: null,
    }
    hub.heartbeatTimer = setInterval(() => broadcastHeartbeat(hub), 5000)
    ticker.on('connect', () => {
      reconcileConnectedHub(hub)
      for (const client of hub.clients) sendEvent(client.socket, { type: 'status', status: 'connected' })
    })
    ticker.on('disconnect', () => markHubBrokerReconnecting(hub))
    ticker.on('close', () => markHubBrokerReconnecting(hub))
    ticker.on('reconnect', () => markHubBrokerReconnecting(hub))
    ticker.on('ticks', (ticks) => broadcastTicks(hub, ticks))
    ticker.on('order_update', (order) => {
      for (const client of hub.clients) sendEvent(client.socket, { type: 'order_update', data: order })
      void persistOrderUpdate(supabase, userId, order as Record<string, unknown>).catch((error) => logger.warn({ err: error, userId }, 'Kite order update reconciliation failed'))
    })
    ticker.on('error', (error) => {
      logger.warn({ err: error, userId }, 'Kite market stream error')
      for (const client of hub.clients) sendEvent(client.socket, { type: 'status', status: 'error' })
    })
    ticker.on('noreconnect', () => {
      for (const client of hub.clients) sendEvent(client.socket, { type: 'status', status: 'unavailable' })
    })
    try {
      ticker.connect()
      if (shuttingDown) throw new Error('The market-stream service is shutting down.')
      hubs.set(userId, hub)
      return hub
    } catch (error) {
      if (hub.heartbeatTimer) clearInterval(hub.heartbeatTimer)
      try {
        ticker.disconnect()
      } catch (cleanupError) {
        logger.warn({ err: cleanupError, userId }, 'Kite market stream creation cleanup failed')
      }
      throw error
    }
  }

  const getOrCreateUserHub = createSingleFlightLoader((userId: string) => hubs.get(userId), createUserHub)

  /**
   * Accepts one authenticated browser socket and applies validated subscription messages.
   */
  async function acceptBrowserSocket(socket: WebSocket, userId: string) {
    socket.on('error', (error) => {
      logger.warn({ err: error, userId }, 'Browser market-stream socket error')
    })
    const hub = await getOrCreateUserHub(userId)
    if (socket.readyState !== WebSocket.OPEN) {
      queueMicrotask(() => {
        if (!hub.clients.size && hubs.get(userId) === hub) closeUserHub(userId, hub)
      })
      return
    }
    if (hub.clients.size >= config.maxStreamClientsPerUser) {
      socket.close(1008, 'Too many market-stream sessions')
      return
    }
    const sessionExpiry = createStreamSessionExpiry(() => socket.close(4001, 'Stream authorization expired'))
    const client: BrowserStreamClient = {
      socket,
      instrumentTokens: new Set(),
      mode: 'quote',
      sessionExpiry,
      subscriptionAccepted: false,
    }
    hub.clients.add(client)
    sendEvent(socket, { type: 'status', status: hub.ticker.connected() ? 'connected' : 'connecting' })
    broadcastHeartbeat(hub)
    socket.on('message', (rawMessage) => {
      try {
        const message = applyInitialMarketSubscription(client, hub, rawMessage.toString())
        sendEvent(socket, { type: 'subscribed', instrumentTokens: message.instrumentTokens })
      } catch (error) {
        const repeated = error instanceof Error && error.message === 'Market-stream subscription is already set.'
        const code = repeated ? 'SUBSCRIPTION_ALREADY_SET' : 'INVALID_SUBSCRIPTION'
        sendEvent(socket, { type: 'error', code, error: repeated ? 'Market-stream subscription cannot be changed.' : 'Invalid market-stream subscription.' })
        socket.close(1008, repeated ? 'Subscription already set' : 'Invalid market-stream subscription')
      }
    })
    socket.on('close', () => {
      client.sessionExpiry.clear()
      hub.clients.delete(client)
      reconcileHub(hub)
      if (!hub.clients.size) {
        closeUserHub(userId, hub)
      }
    })
  }

  server.on('upgrade', (request, socket, head) => {
    let pathname = ''
    try {
      pathname = new URL(request.url || '/', config.PUBLIC_WORKER_URL).pathname
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    if (pathname !== '/api/v1/stream') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    const origin = String(request.headers.origin || '')
    if (!origin || !isAllowedFrontendOrigin(origin, config)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    try {
      const userId = verifySignedState(readStreamTicket(request), config.APP_ENCRYPTION_KEY, 'market-stream')
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        void acceptBrowserSocket(websocket, userId).catch((error) => {
          logger.warn({ err: error, userId }, 'Browser market stream could not start')
          sendEvent(websocket, { type: 'error', error: error instanceof Error ? error.message : 'Market stream failed.' })
          websocket.close(1011, 'Market stream unavailable')
        })
      })
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
    }
  })

  return {
    /** Closes every broker and browser stream during worker shutdown. */
    close() {
      shuttingDown = true
      for (const [userId, hub] of hubs) {
        for (const client of hub.clients) {
          client.sessionExpiry.clear()
          client.socket.close(1001, 'Server shutting down')
        }
        closeUserHub(userId, hub)
      }
      websocketServer.close()
    },
  }
}
