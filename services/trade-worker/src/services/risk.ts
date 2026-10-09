/**
 * Applies deterministic risk ceilings and intent-level trading safeguards.
 * @module services/risk
 */
import { createHash } from 'node:crypto'
import type { RiskDecision, RiskState, TradeIntent } from '../types.js'
import { isIndiaPaperFillWindow } from './trading-session.js'

export const riskDefaults = {
  perTradeRiskPercent: 0.5,
  dailyLossPercent: 2,
  maxPositions: 5,
  maxUtilisationPercent: 100,
  maxQuoteAgeMs: 3000,
} as const

export const riskCeilings = {
  perTradeRiskPercent: 1,
  dailyLossPercent: 3,
  maxPositions: 10,
  maxUtilisationPercent: 100,
} as const

/**
 * Derives a deterministic idempotency identity from the economically relevant intent fields.
 */
export function createIntentKey(intent: TradeIntent) {
  return createHash('sha256').update(JSON.stringify({
    userId: intent.userId,
    instrumentKey: intent.instrumentKey,
    side: intent.side,
    quantity: intent.quantity,
    entryPrice: intent.entryPrice,
    stopLossPrice: intent.stopLossPrice,
    quoteTimestamp: intent.quoteTimestamp,
  })).digest('hex')
}

/**
 * Applies deterministic paper-trading limits to an AI or Algo intent.
 */
export function assessTradeIntent(intent: TradeIntent, state: RiskState, now = new Date()): RiskDecision {
  const reasonCodes: string[] = []
  const intentKey = createIntentKey(intent)
  const riskAmount = Math.abs(intent.entryPrice - intent.stopLossPrice) * intent.quantity
  const calculatedRiskPercent = state.virtualCapital > 0 ? (riskAmount / state.virtualCapital) * 100 : Number.POSITIVE_INFINITY
  const currentPosition = state.positionsByInstrument.get(intent.instrumentKey)
  const oldQuantity = Number(currentPosition?.quantity || 0)
  const oldAverage = Number(currentPosition?.averagePrice || 0)
  const signedQuantity = intent.side === 'BUY' ? intent.quantity : -intent.quantity
  const nextQuantity = oldQuantity + signedQuantity
  const existingInstrumentUtilisation = Math.abs(oldQuantity) * oldAverage
  const sameDirection = oldQuantity === 0 || Math.sign(oldQuantity) === Math.sign(signedQuantity)
  const nextAverage = nextQuantity === 0
    ? 0
    : sameDirection
      ? ((Math.abs(oldQuantity) * oldAverage) + (Math.abs(signedQuantity) * intent.entryPrice)) / Math.abs(nextQuantity)
      : Math.sign(nextQuantity) === Math.sign(oldQuantity) ? oldAverage : intent.entryPrice
  const projectedUtilisation = Math.max(0, state.utilisedCapital - existingInstrumentUtilisation + Math.abs(nextQuantity) * nextAverage)
  const calculatedUtilisationPercent = state.virtualCapital > 0 ? (projectedUtilisation / state.virtualCapital) * 100 : Number.POSITIVE_INFINITY
  const dailyLossPercent = state.virtualCapital > 0 ? (Math.abs(Math.min(0, state.realisedDailyPnl)) / state.virtualCapital) * 100 : Number.POSITIVE_INFINITY
  const quoteAge = now.getTime() - new Date(intent.quoteTimestamp).getTime()

  if (intent.environment !== 'paper') reasonCodes.push('LIVE_AUTONOMY_DISABLED')
  if (!isIndiaPaperFillWindow(now)) reasonCodes.push('MARKET_SESSION_CLOSED')
  if (!Number.isFinite(intent.quantity) || intent.quantity <= 0 || !Number.isInteger(intent.quantity)) reasonCodes.push('INVALID_QUANTITY')
  if (!Number.isFinite(intent.entryPrice) || intent.entryPrice <= 0) reasonCodes.push('INVALID_ENTRY_PRICE')
  if (!Number.isFinite(intent.stopLossPrice) || intent.stopLossPrice <= 0) reasonCodes.push('INVALID_STOP_PRICE')
  if (intent.side === 'BUY' && intent.stopLossPrice >= intent.entryPrice) reasonCodes.push('INVALID_BUY_STOP')
  if (intent.side === 'SELL' && intent.stopLossPrice <= intent.entryPrice) reasonCodes.push('INVALID_SELL_STOP')
  if (!Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge > riskDefaults.maxQuoteAgeMs) reasonCodes.push('STALE_QUOTE')
  if (calculatedRiskPercent > riskDefaults.perTradeRiskPercent) reasonCodes.push('PER_TRADE_RISK_LIMIT')
  if (dailyLossPercent >= riskDefaults.dailyLossPercent) reasonCodes.push('DAILY_LOSS_STOP')
  if (!currentPosition && state.openPositionCount >= riskDefaults.maxPositions) reasonCodes.push('POSITION_LIMIT')
  if (calculatedUtilisationPercent > riskDefaults.maxUtilisationPercent) reasonCodes.push('UTILISATION_LIMIT')
  if (state.existingIntentKeys.has(intentKey)) reasonCodes.push('DUPLICATE_INTENT')
  if (!intent.thesis.trim() || !intent.invalidation.trim()) reasonCodes.push('MISSING_EXPLANATION')
  if (intent.confidence < 0 || intent.confidence > 100) reasonCodes.push('INVALID_CONFIDENCE')

  return {
    approved: reasonCodes.length === 0,
    reasonCodes,
    calculatedRiskPercent: Number(calculatedRiskPercent.toFixed(4)),
    calculatedUtilisationPercent: Number(calculatedUtilisationPercent.toFixed(4)),
    intentKey,
  }
}
