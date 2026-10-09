/**
 * Paper-strategy indicator evaluation with execution disabled until exit guards are complete.
 * @module services/algo
 */

import { z } from 'zod'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import type { TradeIntent } from '../types.js'
import { writeAuditEvent } from './audit.js'
import { resolveBrokerQuote } from './broker-quote.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'
import { processPaperIntent } from './paper.js'

/** Keeps automated entries off until verified stop-loss and target exits are available. */
export const paperStrategyExecutionEnabled: boolean = false

const definitionSchema = z.object({
  instrumentKey: z.string().min(3),
  rules: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).min(1),
  action: z.object({ side: z.enum(['BUY', 'SELL']), quantity: z.number().int().positive(), stopLossPercent: z.number().positive(), targetPercent: z.number().positive() }),
  schedule: z.object({ start: z.string(), stopEntries: z.string(), flatten: z.string(), timezone: z.literal('Asia/Kolkata') }),
})

interface EvaluationContext {
  lastPrice: number
  vwap: number
  latestVolume: number
  averageVolume: number
  closes: number[]
  currentMinutes: number
}

/**
 * Converts a validated HH:mm value to minutes after local midnight.
 */
function clockMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

/**
 * Returns the current India-market minute and trading date.
 */
function indiaMarketClock() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { tradingDate: `${value.year}-${value.month}-${value.day}`, currentMinutes: Number(value.hour) * 60 + Number(value.minute) }
}

/**
 * Calculates an exponential moving-average series for crossover rules.
 */
export function exponentialMovingAverage(values: number[], period: number) {
  if (!values.length) return []
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((series, value, index) => {
    series.push(index === 0 ? value : value * multiplier + series[index - 1]! * (1 - multiplier))
    return series
  }, [])
}

/**
 * Calculates a conventional fourteen-period RSI from closing prices.
 */
export function relativeStrengthIndex(closes: number[], period = 14) {
  if (closes.length <= period) return 50
  const changes = closes.slice(-period - 1).slice(1).map((close, index) => close - closes.slice(-period - 1)[index]!)
  const gains = changes.reduce((total, change) => total + Math.max(0, change), 0) / period
  const losses = changes.reduce((total, change) => total + Math.max(0, -change), 0) / period
  if (losses === 0) return 100
  return 100 - (100 / (1 + gains / losses))
}

/**
 * Compares two values with the strategy's supported declarative operator.
 */
function compare(left: number, operator: string, right: number) {
  if (operator === 'greater_than') return left > right
  if (operator === 'less_than') return left < right
  if (operator === 'equals') return Math.abs(left - right) < 0.0001
  return false
}

/**
 * Evaluates one visual rule against a bounded live quote and five-minute candle context.
 */
export function evaluateRule(rule: { field: string; operator: string; value: string }, context: EvaluationContext) {
  const field = rule.field.toLowerCase()
  const value = rule.value.trim().toLowerCase()
  const previousClose = context.closes.at(-2) || context.lastPrice
  if (field === 'price' && value === 'vwap') {
    if (rule.operator === 'crosses_above') return previousClose <= context.vwap && context.lastPrice > context.vwap
    if (rule.operator === 'crosses_below') return previousClose >= context.vwap && context.lastPrice < context.vwap
    return compare(context.lastPrice, rule.operator, context.vwap)
  }
  if (field === 'price') return compare(context.lastPrice, rule.operator, Number(value))
  if (field === 'volume') {
    const multiplier = Number.parseFloat(value) || 1
    return compare(context.latestVolume, rule.operator, context.averageVolume * multiplier)
  }
  if (field === 'rsi') return compare(relativeStrengthIndex(context.closes), rule.operator, Number(value))
  if (field === 'ema') {
    const period = Math.max(2, Number.parseInt(value.replace(/\D/g, ''), 10) || 20)
    const ema = exponentialMovingAverage(context.closes, period)
    const previousEma = ema.at(-2) || ema.at(-1) || context.lastPrice
    const currentEma = ema.at(-1) || context.lastPrice
    if (rule.operator === 'crosses_above') return previousClose <= previousEma && context.lastPrice > currentEma
    if (rule.operator === 'crosses_below') return previousClose >= previousEma && context.lastPrice < currentEma
    return compare(context.lastPrice, rule.operator, currentEma)
  }
  if (field === 'time') return compare(context.currentMinutes, rule.operator, clockMinutes(value))
  return false
}

/**
 * Evaluates active paper strategies serially and permits one execution per version and trading day.
 */
export async function evaluateActivePaperStrategies(supabase: SupabaseAdmin, config: WorkerConfig) {
  const { tradingDate, currentMinutes } = indiaMarketClock()
  if (!paperStrategyExecutionEnabled) {
    return { evaluated: 0, triggered: 0, tradingDate, disabled: true }
  }
  const { data: strategies, error: strategyError } = await supabase.from('strategies').select('id,user_id,name').eq('status', 'active').eq('environment', 'paper')
  if (strategyError) throw strategyError
  let evaluated = 0
  let triggered = 0
  for (const strategy of strategies || []) {
    const { data: profile } = await supabase.from('profiles').select('is_super_admin,is_trial_active,trial_end_at,subscription_status,subscription_end_at').eq('id', strategy.user_id).maybeSingle()
    const now = Date.now()
    const entitled = profile && (profile.is_super_admin || (profile.is_trial_active && new Date(profile.trial_end_at).getTime() > now) || (profile.subscription_status === 'active' && profile.subscription_end_at && new Date(profile.subscription_end_at).getTime() > now))
    if (!entitled) continue
    const { data: version, error: versionError } = await supabase.from('strategy_versions').select('id,version,definition').eq('strategy_id', strategy.id).order('version', { ascending: false }).limit(1).maybeSingle()
    if (versionError) throw versionError
    const parsed = definitionSchema.safeParse(version?.definition)
    if (!version || !parsed.success) continue
    const definition = parsed.data
    if (currentMinutes < clockMinutes(definition.schedule.start) || currentMinutes >= clockMinutes(definition.schedule.stopEntries)) continue
    const { data: priorExecution } = await supabase.from('strategy_executions').select('id').eq('strategy_version_id', version.id).eq('trading_date', tradingDate).maybeSingle()
    if (priorExecution) continue
    evaluated += 1

    try {
      const { data: instrument, error: instrumentError } = await supabase.from('instruments').select('instrument_token').eq('instrument_key', definition.instrumentKey).eq('is_active', true).maybeSingle()
      if (instrumentError) throw instrumentError
      if (!instrument) throw new Error('Strategy instrument is not active in the Kite master.')
      const { market } = await getAuthenticatedMarketDataClient(supabase, config, strategy.user_id)
      const to = new Date()
      const from = new Date(to.getTime() - 4 * 86400000)
      const [quoteResult, candleResult] = await Promise.all([
        market.getQuote(definition.instrumentKey),
        market.getHistoricalData(Number(instrument.instrument_token), '5minute', from, to),
      ])
      const quote = quoteResult[definition.instrumentKey]
      const { lastPrice, quoteTimestamp } = resolveBrokerQuote(quote, definition.instrumentKey)
      const candles = candleResult.slice(-80)
      const closes = candles.map((candle) => Number(candle.close))
      const volumes = candles.slice(-21, -1).map((candle) => Number(candle.volume || 0))
      const context: EvaluationContext = {
        lastPrice,
        vwap: Number(quote?.average_price || 0),
        latestVolume: Number(candles.at(-1)?.volume || 0),
        averageVolume: volumes.length ? volumes.reduce((total, volume) => total + volume, 0) / volumes.length : 0,
        closes,
        currentMinutes,
      }
      if (!context.lastPrice || !context.vwap || !definition.rules.every((rule) => evaluateRule(rule, context))) continue

      const { data: execution, error: executionError } = await supabase.from('strategy_executions').insert({ user_id: strategy.user_id, strategy_id: strategy.id, strategy_version_id: version.id, trading_date: tradingDate, status: 'evaluating' }).select('id').single()
      if (executionError?.code === '23505') continue
      if (executionError) throw executionError
      const sideMultiplier = definition.action.side === 'BUY' ? -1 : 1
      const intent: TradeIntent = {
        userId: strategy.user_id,
        environment: 'paper',
        source: 'algo',
        instrumentKey: definition.instrumentKey,
        side: definition.action.side,
        quantity: definition.action.quantity,
        entryPrice: context.lastPrice,
        stopLossPrice: context.lastPrice * (1 + sideMultiplier * definition.action.stopLossPercent / 100),
        targetPrice: context.lastPrice * (1 - sideMultiplier * definition.action.targetPercent / 100),
        confidence: 70,
        thesis: `Paper strategy “${strategy.name}” version ${version.version} satisfied every configured condition.`,
        invalidation: `Exit at the configured ${definition.action.stopLossPercent}% stop or the 15:20 IST safety boundary.`,
        quoteTimestamp,
      }
      const result = await processPaperIntent(supabase, intent)
      await supabase.from('strategy_executions').update({ status: result.approved ? 'filled' : 'rejected', intent_key: result.intentKey, result }).eq('id', execution.id)
      await writeAuditEvent(supabase, strategy.user_id, result.approved ? 'ALGO_PAPER_FILLED' : 'ALGO_PAPER_REJECTED', result.approved ? 'An active paper strategy passed its rules and deterministic risk checks.' : 'An active paper strategy triggered but deterministic risk checks rejected it.', { strategyId: strategy.id, strategyVersionId: version.id, executionId: execution.id, reasonCodes: result.reasonCodes })
      triggered += 1
    } catch (error) {
      await supabase.from('strategies').update({ status: 'paused' }).eq('id', strategy.id).eq('user_id', strategy.user_id)
      await writeAuditEvent(supabase, strategy.user_id, 'ALGO_EVALUATION_FAILED', 'A paper strategy evaluation failed safely without a live broker path.', { strategyId: strategy.id, error: error instanceof Error ? error.message : 'Unknown strategy failure' })
    }
  }
  return { evaluated, triggered, tradingDate }
}
