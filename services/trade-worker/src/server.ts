/**
 * Authenticated HTTP, WebSocket, and scheduler entry point for the trade worker.
 * @module server
 */

import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import type { Exchanges, GTTParams, MarginOrder, OrderType, PositionTypes, Product, TransactionType, TriggerType, Validity, Variety } from 'kiteconnect'
import pino from 'pino'
import { pinoHttp } from 'pino-http'
import { z } from 'zod'
import { isAllowedFrontendOrigin, loadConfig } from './config.js'
import { createSignedState } from './lib/crypto.js'
import { createFirebaseIdentitySource } from './lib/firebase.js'
import { createReadinessCache } from './lib/readiness.js'
import { assertSupabaseAdminReady, createSupabaseAdmin } from './lib/supabase.js'
import { requireActiveAccess, requireUser } from './middleware/auth.js'
import { kiteCallbackRateLimitOptions, serializeHttpRequestForLog } from './http-security.js'
import { candleQuerySchema, instrumentKeySchema } from './request-contracts.js'
import { runCopilotResearch } from './services/agent.js'
import { AiRunLeaseExpiredError, createActiveAiRun, updateActiveAiRun } from './services/ai-runs.js'
import { writeAuditEvent } from './services/audit.js'
import {
  completeBrokerLogin,
  consumeBrokerLoginState,
  createBrokerLoginUrl,
  getAuthenticatedKiteClient,
  saveBrokerCredentials,
} from './services/broker.js'
import { getHistoricalCandles, getPaperPortfolioOverview, getPortfolioOverview } from './services/portfolio.js'
import { registerSchedules } from './services/scheduler.js'
import { synchronizeInstrumentMaster } from './services/instruments.js'
import { attachMarketStreamServer } from './services/market-stream.js'
import { getAuthenticatedMarketDataClient } from './services/market-data.js'
import { evaluateLiveExecutionGate } from './services/execution-boundary.js'

const config = loadConfig()
const logger = pino({ level: config.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.authorization', '*.apiSecret', '*.accessToken'] })
const supabase = createSupabaseAdmin(config)
const firebaseIdentity = createFirebaseIdentitySource({
  projectId: config.FIREBASE_PROJECT_ID,
  clientEmail: config.FIREBASE_CLIENT_EMAIL,
  privateKey: config.FIREBASE_PRIVATE_KEY,
  allowApplicationDefault: config.firebaseAllowApplicationDefault,
})
const app = express()
const readiness = createReadinessCache(async () => {
  await Promise.all([
    firebaseIdentity.checkReadiness(),
    assertSupabaseAdminReady(supabase),
  ])
})

app.disable('x-powered-by')
app.set('trust proxy', config.trustProxyHops)
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedFrontendOrigin(origin, config)) callback(null, true)
    else callback(new Error('The browser origin is not allowed.'))
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}))
app.use(express.json({ limit: '256kb' }))
app.use(pinoHttp({ logger, serializers: { req: serializeHttpRequestForLog } }))

/**
 * Converts rejected async handlers into the central Express error boundary.
 */
function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

/**
 * Returns the verified user id or throws when a route was wired incorrectly.
 */
function requireUserId(request: Request) {
  if (!request.user) throw new Error('Verified user context is missing.')
  return request.user.id
}

/**
 * Rejects every state-changing broker call unless deployment and user confirmation gates are open.
 */
function allowLiveBrokerMutation(request: Request, response: Response) {
  const gate = evaluateLiveExecutionGate(config.liveOrderingEnabled, request.header('x-user-confirmed') === 'true')
  if (!gate.allowed) {
    response.status(gate.status).json({ error: gate.error })
    return false
  }
  return true
}

const brokerCredentialSchema = z.object({ apiKey: z.string().min(3).max(128), apiSecret: z.string().min(8).max(256) })
const orderSchema = z.object({
  instrumentKey: instrumentKeySchema,
  exchange: z.string().min(2).max(8),
  tradingsymbol: z.string().min(1).max(64),
  transactionType: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  product: z.enum(['CNC', 'MIS', 'NRML', 'MTF']),
  variety: z.enum(['regular', 'amo', 'co', 'iceberg', 'auction']).default('regular'),
  price: z.number().nonnegative().optional(),
  triggerPrice: z.number().nonnegative().optional(),
  disclosedQuantity: z.number().int().nonnegative().optional(),
  validity: z.enum(['DAY', 'IOC', 'TTL']).default('DAY'),
  validityTtl: z.number().int().positive().max(1440).optional(),
  icebergLegs: z.number().int().min(2).max(10).optional(),
  icebergQuantity: z.number().int().positive().optional(),
  auctionNumber: z.number().int().positive().optional(),
  autoslice: z.boolean().default(false),
})
const strategySchema = z.object({
  strategyId: z.string().uuid().optional(),
  name: z.string().min(3).max(120),
  instrumentKey: z.string().min(3).max(100),
  environment: z.literal('paper'),
  holdingPeriod: z.literal('intraday'),
  rules: z.array(z.object({ field: z.enum(['price', 'volume', 'rsi', 'ema', 'time']), operator: z.enum(['crosses_above', 'crosses_below', 'greater_than', 'less_than', 'equals']), value: z.string().trim().min(1).max(64) })).min(1).max(20),
  action: z.object({ side: z.enum(['BUY', 'SELL']), quantity: z.number().int().positive(), stopLossPercent: z.number().positive().max(1), targetPercent: z.number().positive().max(20) }),
  schedule: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), stopEntries: z.string().regex(/^\d{2}:\d{2}$/), flatten: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.literal('Asia/Kolkata') }),
  activate: z.boolean().default(false),
})
const orderModificationSchema = z.object({
  variety: z.enum(['regular', 'amo', 'co', 'iceberg', 'auction']),
  quantity: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']).optional(),
  validity: z.enum(['DAY', 'IOC', 'TTL']).optional(),
  disclosedQuantity: z.number().int().nonnegative().optional(),
  triggerPrice: z.number().nonnegative().optional(),
  parentOrderId: z.string().optional(),
})
const marginOrderSchema = z.object({
  exchange: z.string().min(2).max(8),
  tradingsymbol: z.string().min(1).max(64),
  transactionType: z.enum(['BUY', 'SELL']),
  variety: z.enum(['regular', 'amo', 'co', 'iceberg', 'auction']),
  product: z.enum(['CNC', 'MIS', 'NRML']),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative().default(0),
  triggerPrice: z.number().nonnegative().default(0),
})
const gttSchema = z.object({
  triggerType: z.enum(['single', 'two-leg']),
  tradingsymbol: z.string().min(1).max(64),
  exchange: z.string().min(2).max(8),
  triggerValues: z.array(z.number().positive()).min(1).max(2),
  lastPrice: z.number().positive(),
  orders: z.array(z.object({
    transactionType: z.enum(['BUY', 'SELL']),
    quantity: z.number().int().positive(),
    product: z.enum(['CNC', 'MIS', 'NRML']),
    orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
    price: z.number().nonnegative(),
  })).min(1).max(2),
})
const positionConversionSchema = z.object({
  exchange: z.string().min(2).max(8),
  tradingsymbol: z.string().min(1).max(64),
  transactionType: z.enum(['BUY', 'SELL']),
  positionType: z.enum(['day', 'overnight']),
  quantity: z.number().int().positive(),
  oldProduct: z.enum(['CNC', 'MIS', 'NRML']),
  newProduct: z.enum(['CNC', 'MIS', 'NRML']),
})

// Public health endpoint contains no account data.
app.get('/health', asyncHandler(async (_request, response) => {
  await readiness.check()
  response.json({ status: 'ok', service: 'stride-trade-worker', dependencies: 'ready', liveOrderingEnabled: config.liveOrderingEnabled, timestamp: new Date().toISOString() })
}))

// Kite redirects here with a one-time token and an atomically consumed state.
app.get('/api/v1/kite/callback', rateLimit(kiteCallbackRateLimitOptions), asyncHandler(async (request, response) => {
  const requestToken = z.string().min(1).parse(request.query.request_token)
  const state = z.string().min(1).parse(request.query.state)
  let consumedState
  try {
    consumedState = await consumeBrokerLoginState(supabase, state)
  } catch (error) {
    logger.warn({ err: error }, 'Kite login callback rejected an invalid or replayed state')
    response.redirect(`${config.FRONTEND_ORIGIN}/trade-zone?broker=error`)
    return
  }
  const { userId, returnOrigin } = consumedState
  try {
    await completeBrokerLogin(supabase, config, userId, requestToken)
    response.redirect(`${returnOrigin}/trade-zone?broker=connected`)
    void synchronizeInstrumentMaster(supabase, config, userId).catch((error) => logger.warn({ err: error }, 'Post-login instrument refresh failed'))
  } catch (error) {
    logger.warn({ err: error, userId }, 'Kite login callback failed')
    response.redirect(`${returnOrigin}/trade-zone?broker=error`)
  }
}))

app.use(
  '/api/v1',
  rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  requireUser(firebaseIdentity, supabase, { superadminEmail: config.FIREBASE_SUPERADMIN_EMAIL }),
  requireActiveAccess(),
)

// Store or rotate one user's encrypted personal Kite app credentials.
app.post('/api/v1/broker/credentials', asyncHandler(async (request, response) => {
  const credentials = brokerCredentialSchema.parse(request.body)
  await saveBrokerCredentials(supabase, config, requireUserId(request), credentials.apiKey, credentials.apiSecret)
  response.status(204).end()
}))

// Generate a short-lived, user-bound Kite authentication URL.
app.get('/api/v1/kite/login-url', asyncHandler(async (request, response) => {
  const requestOrigin = request.header('origin') || config.FRONTEND_ORIGIN
  const returnOrigin = isAllowedFrontendOrigin(requestOrigin, config) ? requestOrigin : config.FRONTEND_ORIGIN
  const url = await createBrokerLoginUrl(supabase, config, requireUserId(request), returnOrigin)
  response.json({ data: { url } })
}))

// Mint a single-purpose, short-lived ticket so access tokens never appear in stream URLs.
app.post('/api/v1/stream-ticket', asyncHandler(async (request, response) => {
  const userId = requireUserId(request)
  await getAuthenticatedMarketDataClient(supabase, config, userId)
  response.json({ data: { ticket: createSignedState(userId, config.APP_ENCRYPTION_KEY, 45, 'market-stream'), expiresIn: 45 } })
}))

// Return the isolated account overview for the authenticated user.
app.get('/api/v1/overview', asyncHandler(async (request, response) => {
  const { environment } = z.object({ environment: z.enum(['paper', 'live']).default('paper') }).parse(request.query)
  const userId = requireUserId(request)
  response.json({ data: environment === 'paper' ? await getPaperPortfolioOverview(supabase, config, userId) : await getPortfolioOverview(supabase, config, userId) })
}))

// Return indexed historical candles through a server-held broker token.
app.get('/api/v1/market/candles', asyncHandler(async (request, response) => {
  const query = candleQuerySchema.parse(request.query)
  response.json({ data: await getHistoricalCandles(supabase, config, requireUserId(request), query.instrument, query.interval) })
}))

// Search the normalized daily instrument master without exposing broker secrets.
app.get('/api/v1/instruments', asyncHandler(async (request, response) => {
  const query = z.object({ q: z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N} .&-]+$/u) }).parse(request.query)
  const { data, error } = await supabase.from('instruments').select('instrument_key,instrument_token,exchange,tradingsymbol,name,expiry,strike,instrument_type').eq('is_active', true).or(`tradingsymbol.ilike.%${query.q}%,name.ilike.%${query.q}%`).limit(30)
  if (error) throw error
  response.json({ data: (data || []).map((instrument) => ({
    instrumentKey: instrument.instrument_key,
    instrumentToken: Number(instrument.instrument_token),
    exchange: instrument.exchange,
    symbol: instrument.tradingsymbol,
    name: instrument.name,
    expiry: instrument.expiry,
    strike: instrument.strike,
    instrumentType: instrument.instrument_type,
  })) })
}))

// Add an active instrument to the caller's default persistent watchlist.
app.post('/api/v1/watchlist/items', asyncHandler(async (request, response) => {
  const userId = requireUserId(request)
  const { instrumentKey } = z.object({ instrumentKey: z.string().min(3).max(100) }).parse(request.body)
  const { data: instrument, error: instrumentError } = await supabase.from('instruments').select('instrument_key').eq('instrument_key', instrumentKey).eq('is_active', true).maybeSingle()
  if (instrumentError) throw instrumentError
  if (!instrument) {
    response.status(404).json({ error: 'The instrument is not present in the active Kite master.' })
    return
  }
  let { data: watchlist, error: watchlistError } = await supabase.from('watchlists').select('id').eq('user_id', userId).eq('name', 'My watchlist').maybeSingle()
  if (watchlistError) throw watchlistError
  if (!watchlist) {
    const created = await supabase.from('watchlists').insert({ user_id: userId, name: 'My watchlist' }).select('id').single()
    if (created.error) throw created.error
    watchlist = created.data
  }
  const { count, error: countError } = await supabase.from('watchlist_items').select('id', { count: 'exact', head: true }).eq('watchlist_id', watchlist.id)
  if (countError) throw countError
  if ((count || 0) >= 100) {
    response.status(409).json({ error: 'The watchlist limit of 100 instruments has been reached.' })
    return
  }
  const { data, error } = await supabase.from('watchlist_items').upsert({ user_id: userId, watchlist_id: watchlist.id, instrument_key: instrumentKey }, { onConflict: 'watchlist_id,instrument_key' }).select('id,instrument_key').single()
  if (error) throw error
  response.status(201).json({ data })
}))

// Remove an instrument from the caller's watchlist without touching the instrument master.
app.delete('/api/v1/watchlist/items/:instrumentKey', asyncHandler(async (request, response) => {
  const userId = requireUserId(request)
  const instrumentKey = z.string().min(3).max(100).parse(request.params.instrumentKey)
  const { error } = await supabase.from('watchlist_items').delete().eq('user_id', userId).eq('instrument_key', instrumentKey)
  if (error) throw error
  response.status(204).end()
}))

// Return live depth and quote data through the user's server-held Kite session.
app.get('/api/v1/market/quotes', asyncHandler(async (request, response) => {
  const { instruments } = z.object({ instruments: z.string().min(3).max(3000) }).parse(request.query)
  const keys = instruments.split(',').map((key) => key.trim()).filter(Boolean)
  if (!keys.length || keys.length > 100) {
    response.status(400).json({ error: 'Provide between 1 and 100 instrument keys.' })
    return
  }
  const { market } = await getAuthenticatedMarketDataClient(supabase, config, requireUserId(request))
  response.json({ data: await market.getQuote(keys) })
}))

// Submit a manual live order only after feature gating and idempotency validation.
app.post('/api/v1/live/orders', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const idempotencyKey = request.header('idempotency-key')
  if (!idempotencyKey || idempotencyKey.length > 128) {
    response.status(400).json({ error: 'A valid Idempotency-Key header is required.' })
    return
  }
  const order = orderSchema.parse(request.body)
  const { data: existing } = await supabase.from('orders').select('id,broker_order_id,status').eq('user_id', userId).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing) {
    response.json({ data: existing })
    return
  }
  const { data: stored, error: insertError } = await supabase.from('orders').insert({
    user_id: userId,
    environment: 'live',
    idempotency_key: idempotencyKey,
    instrument_key: order.instrumentKey,
    tradingsymbol: order.tradingsymbol,
    exchange: order.exchange,
    side: order.transactionType,
    quantity: order.quantity,
    order_type: order.orderType,
    product: order.product,
    variety: order.variety,
    requested_price: order.price || null,
    status: 'submitting',
    source: 'manual',
  }).select('id').single()
  if (insertError) throw insertError
  const brokerTag = `st${stored.id.replaceAll('-', '').slice(0, 18)}`
  let kiteClient: Awaited<ReturnType<typeof getAuthenticatedKiteClient>> | null = null
  try {
    kiteClient = await getAuthenticatedKiteClient(supabase, config, userId)
    const brokerResult = await kiteClient.kite.placeOrder(order.variety as Variety, {
      exchange: order.exchange as Exchanges,
      tradingsymbol: order.tradingsymbol,
      transaction_type: order.transactionType as TransactionType,
      quantity: order.quantity,
      product: order.product as Product,
      order_type: order.orderType as OrderType,
      validity: order.validity as Validity,
      price: order.price,
      trigger_price: order.triggerPrice,
      disclosed_quantity: order.disclosedQuantity,
      validity_ttl: order.validityTtl,
      iceberg_legs: order.icebergLegs,
      iceberg_quantity: order.icebergQuantity,
      auction_number: order.auctionNumber,
      autoslice: order.autoslice,
      tag: brokerTag,
    })
    await supabase.from('orders').update({ broker_order_id: brokerResult.order_id, status: 'submitted' }).eq('id', stored.id)
    await writeAuditEvent(supabase, userId, 'LIVE_ORDER_SUBMITTED', 'A user-confirmed order was submitted to Kite.', { orderId: stored.id, brokerOrderId: brokerResult.order_id })
    response.status(202).json({ data: { id: stored.id, brokerOrderId: brokerResult.order_id, status: 'submitted' } })
  } catch (error) {
    const brokerOrders = kiteClient ? await kiteClient.kite.getOrders().catch(() => []) : []
    const recoveredOrder = brokerOrders.find((brokerOrder) => brokerOrder.tag === brokerTag)
    if (recoveredOrder) {
      await supabase.from('orders').update({ broker_order_id: recoveredOrder.order_id, status: String(recoveredOrder.status || 'submitted').toLowerCase(), status_message: 'Recovered by broker-tag reconciliation after an ambiguous response.' }).eq('id', stored.id)
      await writeAuditEvent(supabase, userId, 'LIVE_ORDER_RECONCILED', 'An ambiguous order response was reconciled against the Kite order book.', { orderId: stored.id, brokerOrderId: recoveredOrder.order_id })
      response.status(202).json({ data: { id: stored.id, brokerOrderId: recoveredOrder.order_id, status: recoveredOrder.status, reconciled: true } })
      return
    }
    await supabase.from('orders').update({ status: 'submit_failed', status_message: error instanceof Error ? error.message : 'Broker submission failed' }).eq('id', stored.id)
    await writeAuditEvent(supabase, userId, 'LIVE_ORDER_SUBMIT_FAILED', 'A user-confirmed order failed before broker acknowledgement.', { orderId: stored.id })
    throw error
  }
}))

// Modify a live broker order after a fresh explicit confirmation.
app.patch('/api/v1/live/orders/:orderId', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const orderId = z.string().min(1).max(64).parse(request.params.orderId)
  const modification = orderModificationSchema.parse(request.body)
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const result = await kite.modifyOrder(modification.variety as Variety, orderId, {
    quantity: modification.quantity,
    price: modification.price,
    order_type: modification.orderType as OrderType | undefined,
    validity: modification.validity as Validity | undefined,
    disclosed_quantity: modification.disclosedQuantity,
    trigger_price: modification.triggerPrice,
    parent_order_id: modification.parentOrderId,
  })
  await writeAuditEvent(supabase, userId, 'LIVE_ORDER_MODIFIED', 'A user-confirmed Kite order modification was submitted.', { orderId: result.order_id })
  response.json({ data: result })
}))

// Cancel a live broker order after a fresh explicit confirmation.
app.delete('/api/v1/live/orders/:orderId', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const orderId = z.string().min(1).max(64).parse(request.params.orderId)
  const query = z.object({ variety: z.enum(['regular', 'amo', 'co', 'iceberg', 'auction']), parentOrderId: z.string().optional() }).parse(request.query)
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const result = await kite.cancelOrder(query.variety, orderId, { parent_order_id: query.parentOrderId })
  await writeAuditEvent(supabase, userId, 'LIVE_ORDER_CANCELLED', 'A user-confirmed Kite order cancellation was submitted.', { orderId: result.order_id })
  response.json({ data: result })
}))

// Return the complete status timeline for one broker order.
app.get('/api/v1/live/orders/:orderId/history', asyncHandler(async (request, response) => {
  const orderId = z.string().min(1).max(64).parse(request.params.orderId)
  const { kite } = await getAuthenticatedKiteClient(supabase, config, requireUserId(request))
  response.json({ data: await kite.getOrderHistory(orderId) })
}))

// Return the day's individual broker executions, including partial fills.
app.get('/api/v1/live/trades', asyncHandler(async (request, response) => {
  const { kite } = await getAuthenticatedKiteClient(supabase, config, requireUserId(request))
  response.json({ data: await kite.getTrades() })
}))

// Preview required margin without submitting any order.
app.post('/api/v1/live/margins/orders', asyncHandler(async (request, response) => {
  const orders = z.array(marginOrderSchema).min(1).max(20).parse(request.body)
  const normalized = orders.map((order) => ({
    exchange: order.exchange as Exchanges,
    tradingsymbol: order.tradingsymbol,
    transaction_type: order.transactionType as TransactionType,
    variety: order.variety as Variety,
    product: order.product as Product,
    order_type: order.orderType as OrderType,
    quantity: order.quantity,
    price: order.price,
    trigger_price: order.triggerPrice,
  })) as MarginOrder[]
  const { kite } = await getAuthenticatedKiteClient(supabase, config, requireUserId(request))
  response.json({ data: await kite.orderMargins(normalized) })
}))

// Preview basket margin and spread benefit without submitting its legs.
app.post('/api/v1/live/margins/basket', asyncHandler(async (request, response) => {
  const body = z.object({ orders: z.array(marginOrderSchema).min(1).max(20), considerPositions: z.boolean().default(true) }).parse(request.body)
  const normalized = body.orders.map((order) => ({
    exchange: order.exchange as Exchanges,
    tradingsymbol: order.tradingsymbol,
    transaction_type: order.transactionType as TransactionType,
    variety: order.variety as Variety,
    product: order.product as Product,
    order_type: order.orderType as OrderType,
    quantity: order.quantity,
    price: order.price,
    trigger_price: order.triggerPrice,
  })) as MarginOrder[]
  const { kite } = await getAuthenticatedKiteClient(supabase, config, requireUserId(request))
  response.json({ data: await kite.orderBasketMargins(normalized, body.considerPositions) })
}))

// List all active GTT instructions held by the caller's Kite account.
app.get('/api/v1/live/gtt', asyncHandler(async (request, response) => {
  const { kite } = await getAuthenticatedKiteClient(supabase, config, requireUserId(request))
  response.json({ data: await kite.getGTTs() })
}))

// Create a single-leg or OCO GTT instruction behind live-action gates.
app.post('/api/v1/live/gtt', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const gtt = gttSchema.parse(request.body)
  const expectedLegs = gtt.triggerType === 'single' ? 1 : 2
  if (gtt.triggerValues.length !== expectedLegs || gtt.orders.length !== expectedLegs) {
    response.status(400).json({ error: `${gtt.triggerType} GTT requires exactly ${expectedLegs} trigger value(s) and order leg(s).` })
    return
  }
  const params: GTTParams = {
    trigger_type: gtt.triggerType as TriggerType,
    tradingsymbol: gtt.tradingsymbol,
    exchange: gtt.exchange as Exchanges,
    trigger_values: gtt.triggerValues,
    last_price: gtt.lastPrice,
    orders: gtt.orders.map((order) => ({ transaction_type: order.transactionType as TransactionType, quantity: order.quantity, product: order.product as Product, order_type: order.orderType as OrderType, price: order.price })),
  }
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const result = await kite.placeGTT(params)
  await writeAuditEvent(supabase, userId, 'LIVE_GTT_CREATED', 'A user-confirmed Kite GTT instruction was created.', { triggerId: result.trigger_id })
  response.status(201).json({ data: result })
}))

// Modify one GTT instruction behind live-action gates.
app.patch('/api/v1/live/gtt/:triggerId', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const triggerId = z.coerce.number().int().positive().parse(request.params.triggerId)
  const gtt = gttSchema.parse(request.body)
  const expectedLegs = gtt.triggerType === 'single' ? 1 : 2
  if (gtt.triggerValues.length !== expectedLegs || gtt.orders.length !== expectedLegs) {
    response.status(400).json({ error: `${gtt.triggerType} GTT requires exactly ${expectedLegs} trigger value(s) and order leg(s).` })
    return
  }
  const params: GTTParams = {
    trigger_type: gtt.triggerType as TriggerType,
    tradingsymbol: gtt.tradingsymbol,
    exchange: gtt.exchange as Exchanges,
    trigger_values: gtt.triggerValues,
    last_price: gtt.lastPrice,
    orders: gtt.orders.map((order) => ({ transaction_type: order.transactionType as TransactionType, quantity: order.quantity, product: order.product as Product, order_type: order.orderType as OrderType, price: order.price })),
  }
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const result = await kite.modifyGTT(triggerId, params)
  await writeAuditEvent(supabase, userId, 'LIVE_GTT_MODIFIED', 'A user-confirmed Kite GTT instruction was modified.', { triggerId: result.trigger_id })
  response.json({ data: result })
}))

// Delete one GTT instruction behind live-action gates.
app.delete('/api/v1/live/gtt/:triggerId', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const triggerId = z.coerce.number().int().positive().parse(request.params.triggerId)
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const result = await kite.deleteGTT(triggerId)
  await writeAuditEvent(supabase, userId, 'LIVE_GTT_DELETED', 'A user-confirmed Kite GTT instruction was deleted.', { triggerId: result.trigger_id })
  response.json({ data: result })
}))

// Convert an eligible position product behind live-action gates.
app.post('/api/v1/live/positions/convert', asyncHandler(async (request, response) => {
  if (!allowLiveBrokerMutation(request, response)) return
  const userId = requireUserId(request)
  const conversion = positionConversionSchema.parse(request.body)
  const { kite } = await getAuthenticatedKiteClient(supabase, config, userId)
  const converted = await kite.convertPosition({
    exchange: conversion.exchange as Exchanges,
    tradingsymbol: conversion.tradingsymbol,
    transaction_type: conversion.transactionType as TransactionType,
    position_type: conversion.positionType as PositionTypes,
    quantity: conversion.quantity,
    old_product: conversion.oldProduct as Product,
    new_product: conversion.newProduct as Product,
  })
  await writeAuditEvent(supabase, userId, 'LIVE_POSITION_CONVERTED', 'A user-confirmed Kite position conversion was submitted.', { tradingsymbol: conversion.tradingsymbol, converted })
  response.json({ data: { converted } })
}))

// Save an immutable visual strategy version; execution remains paper-only.
app.post('/api/v1/strategies', asyncHandler(async (request, response) => {
  const userId = requireUserId(request)
  const strategy = strategySchema.parse(request.body)
  if (strategy.activate) {
    response.status(409).json({ error: 'Paper strategy activation is disabled until automatic stop-loss and target exits are implemented and verified.' })
    return
  }
  const { data: instrument, error: instrumentError } = await supabase.from('instruments').select('instrument_key').eq('instrument_key', strategy.instrumentKey).eq('is_active', true).maybeSingle()
  if (instrumentError) throw instrumentError
  if (!instrument) {
    response.status(404).json({ error: 'The strategy instrument is not in the active Kite master.' })
    return
  }
  let parentId = strategy.strategyId
  let nextVersion = 1
  if (parentId) {
    const { data: existingParent, error: parentError } = await supabase.from('strategies').select('id').eq('id', parentId).eq('user_id', userId).maybeSingle()
    if (parentError) throw parentError
    if (!existingParent) {
      response.status(404).json({ error: 'The strategy does not belong to this account.' })
      return
    }
    const { data: latestVersion, error: latestVersionError } = await supabase.from('strategy_versions').select('version').eq('strategy_id', parentId).order('version', { ascending: false }).limit(1).maybeSingle()
    if (latestVersionError) throw latestVersionError
    nextVersion = Number(latestVersion?.version || 0) + 1
  } else {
    const { data: parent, error: parentError } = await supabase.from('strategies').insert({ user_id: userId, name: strategy.name, status: 'draft', environment: 'paper' }).select('id').single()
    if (parentError) throw parentError
    parentId = parent.id
  }
  const { data: version, error: versionError } = await supabase.from('strategy_versions').insert({ user_id: userId, strategy_id: parentId, version: nextVersion, definition: strategy }).select('id,version').single()
  if (versionError) throw versionError
  const { error: updateError } = await supabase.from('strategies').update({ name: strategy.name, status: 'draft' }).eq('id', parentId).eq('user_id', userId)
  if (updateError) throw updateError
  await writeAuditEvent(supabase, userId, 'STRATEGY_VERSION_CREATED', 'A paper-only visual strategy draft was saved without enabling automated execution.', { strategyId: parentId, version: nextVersion, activated: false })
  response.status(201).json({ data: { id: parentId, version: version.version, name: strategy.name, environment: 'paper', status: 'draft' } })
}))

// Queue a user-requested isolated paper research run.
app.post('/api/v1/ai/runs', asyncHandler(async (request, response) => {
  const userId = requireUserId(request)
  const body = z.object({ environment: z.literal('paper') }).parse(request.body)
  const run = await createActiveAiRun(supabase, {
    userId,
    phase: 'morning_research',
    status: 'queued',
    metadata: body,
  })
  if (!run) {
    response.status(409).json({ error: 'A paper research run is already active for this account.' })
    return
  }
  response.status(202).json({ data: { id: run.id, status: 'queued', message: 'Paper research run queued.' } })
  void (async () => {
    try {
      const started = await updateActiveAiRun(supabase, userId, run, { status: 'running' }, ['queued'])
      if (!started) throw new AiRunLeaseExpiredError()
      await runCopilotResearch(supabase, config, userId, run.id, run.leaseToken, 'morning_research')
    } catch (runError) {
      try {
        await updateActiveAiRun(supabase, userId, run, { status: 'failed', completed_at: new Date().toISOString(), error: runError instanceof Error ? runError.message : 'Unknown agent failure' })
      } catch (failureUpdateError) {
        logger.error({ err: failureUpdateError, runId: run.id }, 'Queued Copilot failure status could not be persisted')
      }
      logger.error({ err: runError, runId: run.id }, 'Queued Copilot run failed')
    }
  })()
}))

// Retrieve the caller's visible AI run history.
app.get('/api/v1/ai/runs', asyncHandler(async (request, response) => {
  const { data, error } = await supabase.from('ai_runs').select('id,phase,status,started_at,completed_at,summary,intent_count,error').eq('user_id', requireUserId(request)).order('started_at', { ascending: false }).limit(50)
  if (error) throw error
  response.json({ data })
}))

// Central error response hides secrets and implementation traces from clients.
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const validationError = error instanceof z.ZodError
  logger.error({ err: error }, 'Request failed')
  response.status(validationError ? 400 : 500).json({
    error: validationError ? 'The request did not match the required contract.' : 'The request could not be completed. Review the server audit log for details.',
  })
})

/**
 * Freshly verifies Firebase and required Supabase runtime guards before binding
 * any public network listener.
 */
async function startWorker() {
  await readiness.check({ force: true })
  const schedules = registerSchedules(supabase, config, firebaseIdentity, logger)
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'Stride trade worker listening'))
  const marketStreams = attachMarketStreamServer(server, supabase, config, logger)
  return { schedules, server, marketStreams }
}

const runtime = config.NODE_ENV === 'test'
  ? null
  : await startWorker().catch((error) => {
      logger.fatal({ err: error }, 'Trade worker startup readiness failed')
      process.exit(1)
    })

/**
 * Stops schedules and the HTTP listener without abandoning in-flight responses.
 */
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down trade worker')
  runtime?.schedules.stop()
  runtime?.marketStreams.close()
  if (!runtime) {
    process.exit(0)
  }
  runtime.server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { app }
