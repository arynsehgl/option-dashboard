/** Exposes an explicitly read-only subset of authenticated Kite market-data APIs. */
import { KiteConnect, type Connect } from 'kiteconnect'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getBrokerSecrets } from './broker.js'

export type ReadOnlyKiteMarketDataClient = Readonly<Pick<Connect,
  'getLTP' | 'getQuote' | 'getHistoricalData' | 'getHoldings'
>>

/**
 * Exposes only read capabilities from an authenticated Kite client.
 * The returned object intentionally has no order, GTT, or position-mutation methods.
 */
export function createReadOnlyMarketDataClient(kite: Connect): ReadOnlyKiteMarketDataClient {
  return Object.freeze({
    getLTP: kite.getLTP.bind(kite),
    getQuote: kite.getQuote.bind(kite),
    getHistoricalData: kite.getHistoricalData.bind(kite),
    getHoldings: kite.getHoldings.bind(kite),
  })
}

/**
 * Builds a user-scoped, read-only market-data client from today's encrypted Kite session.
 */
export async function getAuthenticatedMarketDataClient(supabase: SupabaseAdmin, config: WorkerConfig, userId: string) {
  const secrets = await getBrokerSecrets(supabase, config, userId)
  if (!secrets.accessToken || !secrets.tokenExpiresAt || new Date(secrets.tokenExpiresAt) <= new Date()) {
    throw new Error('Kite login is required for today’s live market data.')
  }
  const kite = new KiteConnect({ api_key: secrets.apiKey })
  kite.setAccessToken(secrets.accessToken)
  return { market: createReadOnlyMarketDataClient(kite), secrets }
}
