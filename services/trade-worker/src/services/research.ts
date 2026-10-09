/** Collects bounded, hashed Kite evidence for paper-trading research reports. */
import { createHash } from 'node:crypto'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'

/**
 * Produces a compact evidence sentence from a live Kite quote and market depth snapshot.
 */
function summarizeQuote(instrumentKey: string, quote: Record<string, unknown>) {
  const ohlc = (quote.ohlc || {}) as Record<string, unknown>
  const depth = (quote.depth || {}) as { buy?: Array<Record<string, unknown>>; sell?: Array<Record<string, unknown>> }
  const bestBid = Number(depth.buy?.[0]?.price || 0)
  const bestAsk = Number(depth.sell?.[0]?.price || 0)
  const spread = bestBid && bestAsk ? Number((bestAsk - bestBid).toFixed(4)) : null
  return `${instrumentKey}: LTP ${Number(quote.last_price || 0)}, open ${Number(ohlc.open || 0)}, high ${Number(ohlc.high || 0)}, low ${Number(ohlc.low || 0)}, previous close ${Number(ohlc.close || 0)}, volume ${Number(quote.volume || 0)}, average traded price ${Number(quote.average_price || 0)}, day change ${Number(quote.net_change || quote.change || 0)}, best bid ${bestBid || 'unavailable'}, best ask ${bestAsk || 'unavailable'}, spread ${spread ?? 'unavailable'}, open interest ${Number(quote.oi || 0)}.`
}

/**
 * Captures fresh, user-scoped market evidence from the account watchlist and holdings.
 */
export async function collectKiteResearchEvidence(supabase: SupabaseAdmin, config: WorkerConfig, userId: string) {
  const { market } = await getAuthenticatedMarketDataClient(supabase, config, userId)
  const [{ data: watchlistRows, error: watchlistError }, holdings] = await Promise.all([
    supabase.from('watchlist_items').select('instrument_key').eq('user_id', userId).limit(25),
    market.getHoldings(),
  ])
  if (watchlistError) throw watchlistError
  const keys = Array.from(new Set([
    ...(watchlistRows || []).map((row) => row.instrument_key),
    ...(holdings || []).map((holding) => `${holding.exchange}:${holding.tradingsymbol}`),
  ])).slice(0, 25)
  if (!keys.length) return []

  const quotes = await market.getQuote(keys)
  const observedAt = new Date().toISOString()
  const evidence = Object.entries(quotes).map(([instrumentKey, quote]) => {
    const summary = summarizeQuote(instrumentKey, quote as unknown as Record<string, unknown>)
    return {
      user_id: userId,
      source_type: 'broker_market_snapshot',
      source_name: 'Kite Connect',
      instrument_key: instrumentKey,
      title: `${instrumentKey} live market snapshot`,
      summary,
      observed_at: observedAt,
      payload_hash: createHash('sha256').update(summary).digest('hex'),
    }
  })
  if (evidence.length) {
    const { error } = await supabase.from('research_evidence').insert(evidence)
    if (error) throw error
  }
  return evidence
}
