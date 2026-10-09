/**
 * Deterministic paper-account risk loading and simulated fill processing.
 * @module services/paper
 */

import type { SupabaseAdmin } from '../lib/supabase.js'
import type { RiskState, TradeIntent } from '../types.js'
import { assessTradeIntent } from './risk.js'
import { getIndiaTradingDate, getIndiaTradingDayStart, resolveDailyRealisedPnl } from './trading-session.js'

export const paperSlippageBasisPoints = 2

/** Database capability tying an AI fill to one active fenced run. */
export interface AiPaperRunFence {
  runId: string
  leaseToken: string
}

/**
 * Applies a small deterministic adverse fill and estimated charges to a paper intent.
 */
export function calculatePaperFill(intent: Pick<TradeIntent, 'side' | 'entryPrice' | 'quantity'>) {
  const adverseMultiplier = intent.side === 'BUY'
    ? 1 + paperSlippageBasisPoints / 10000
    : 1 - paperSlippageBasisPoints / 10000
  const fillPrice = Number((intent.entryPrice * adverseMultiplier).toFixed(4))
  const grossValue = fillPrice * intent.quantity
  const estimatedFees = Number(Math.max(0.01, grossValue * 0.00035).toFixed(2))
  return { fillPrice, estimatedFees, slippageBasisPoints: paperSlippageBasisPoints }
}

/**
 * Loads the current virtual account state needed by deterministic risk checks.
 */
export async function loadRiskState(supabase: SupabaseAdmin, userId: string): Promise<RiskState> {
  const today = getIndiaTradingDate()
  const dayStart = getIndiaTradingDayStart(today)
  const [accountResult, positionsResult, decisionsResult, fillsResult] = await Promise.all([
    supabase.from('paper_accounts').select('virtual_balance,realised_daily_pnl,lifetime_realised_pnl,total_fees,utilised_capital,pnl_session_date').eq('user_id', userId).maybeSingle(),
    supabase.from('paper_positions').select('instrument_key,quantity,average_price').eq('user_id', userId).neq('quantity', 0),
    supabase.from('risk_decisions').select('intent_key').eq('user_id', userId).gte('created_at', dayStart),
    supabase.from('paper_fills').select('fees').eq('user_id', userId).gte('created_at', dayStart),
  ])
  const queryError = accountResult.error || positionsResult.error || decisionsResult.error || fillsResult.error
  if (queryError) throw queryError
  const account = accountResult.data
  if (!account) throw new Error('Paper account is not initialized for this user.')
  return {
    virtualCapital: Math.max(0, Number(account.virtual_balance) + Number(account.lifetime_realised_pnl || 0) - Number(account.total_fees || 0)),
    realisedDailyPnl: resolveDailyRealisedPnl(account, today) - (fillsResult.data || []).reduce((total, fill) => total + Number(fill.fees || 0), 0),
    utilisedCapital: Number(account.utilised_capital),
    openPositionCount: positionsResult.data?.length || 0,
    existingIntentKeys: new Set((decisionsResult.data || []).map((decision) => decision.intent_key)),
    positionsByInstrument: new Map((positionsResult.data || []).map((position) => [position.instrument_key, { quantity: Number(position.quantity), averagePrice: Number(position.average_price) }])),
  }
}

/**
 * Evaluates and records an AI/Algo intent, creating a paper fill only when approved.
 */
export async function processPaperIntent(
  supabase: SupabaseAdmin,
  intent: TradeIntent,
  aiRunFence?: AiPaperRunFence,
) {
  const source = intent.source || 'ai'
  if (source !== 'ai') throw new Error('Automated Algo execution is disabled in V2.')
  if (!aiRunFence) throw new Error('AI paper intents require an active run lease.')
  const state = await loadRiskState(supabase, intent.userId)
  const decision = assessTradeIntent(intent, state)
  if (!decision.approved) {
    const { error } = await supabase.rpc('record_ai_risk_rejection', {
      p_user_id: intent.userId,
      p_ai_run_id: aiRunFence.runId,
      p_ai_run_lease: aiRunFence.leaseToken,
      p_intent_key: decision.intentKey,
      p_reason_codes: decision.reasonCodes,
      p_calculated_risk_percent: decision.calculatedRiskPercent,
      p_calculated_utilisation_percent: decision.calculatedUtilisationPercent,
      p_intent: intent,
    })
    if (error) throw error
    return decision
  }

  const { fillPrice, estimatedFees } = calculatePaperFill(intent)
  const { data: paperOrderId, error: fillError } = await supabase.rpc('record_paper_fill', {
    p_user_id: intent.userId,
    p_intent_key: decision.intentKey,
    p_instrument_key: intent.instrumentKey,
    p_side: intent.side,
    p_quantity: intent.quantity,
    p_fill_price: fillPrice,
    p_fees: estimatedFees,
    p_quote_timestamp: intent.quoteTimestamp,
    p_thesis: intent.thesis,
    p_invalidation: intent.invalidation,
    p_source: source,
    p_ai_run_id: aiRunFence?.runId || null,
    p_ai_run_lease: aiRunFence?.leaseToken || null,
    p_risk_decision: {
      approved: decision.approved,
      reasonCodes: decision.reasonCodes,
      calculatedRiskPercent: decision.calculatedRiskPercent,
      calculatedUtilisationPercent: decision.calculatedUtilisationPercent,
      intent,
    },
  })
  if (fillError) throw fillError
  return { ...decision, paperOrderId }
}
