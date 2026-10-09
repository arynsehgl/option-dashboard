/**
 * Bounded public and model-facing request schemas shared by worker routes.
 * @module request-contracts
 */

import { z } from 'zod'

/** Canonical bounded instrument key accepted by Trade Zone APIs and tools. */
export const instrumentKeySchema = z.string().min(3).max(100)

/** Bounded AI thesis text retained in plans, decisions, and audit metadata. */
export const tradeThesisSchema = z.string().min(20).max(2000)

/** Bounded AI invalidation text retained in plans, decisions, and audit metadata. */
export const tradeInvalidationSchema = z.string().min(10).max(1000)

/** Strict public candle-query contract mapped to Kite-supported intervals. */
export const candleQuerySchema = z.object({
  instrument: instrumentKeySchema,
  interval: z.enum(['1m', '5m', '15m', '1h', '1D']).default('15m'),
})
