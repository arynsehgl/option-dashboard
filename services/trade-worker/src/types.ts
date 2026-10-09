/**
 * Shared authenticated trading, intent, and risk contracts.
 * @module types
 */

import type { User } from '@supabase/supabase-js'

export type TradingEnvironment = 'paper' | 'live'
export type TradeSide = 'BUY' | 'SELL'

export interface AuthenticatedRequestContext {
  user: User
}

export interface BrokerSecrets {
  apiKey: string
  apiSecret: string
  accessToken?: string
  brokerUserId?: string
  tokenExpiresAt?: string
}

export interface TradeIntent {
  userId: string
  environment: 'paper'
  instrumentKey: string
  side: TradeSide
  quantity: number
  entryPrice: number
  stopLossPrice: number
  targetPrice?: number
  confidence: number
  thesis: string
  invalidation: string
  quoteTimestamp: string
  source?: 'ai' | 'algo'
}

export interface RiskState {
  virtualCapital: number
  realisedDailyPnl: number
  openPositionCount: number
  utilisedCapital: number
  existingIntentKeys: Set<string>
  positionsByInstrument: Map<string, { quantity: number; averagePrice: number }>
}

export interface RiskDecision {
  approved: boolean
  reasonCodes: string[]
  calculatedRiskPercent: number
  calculatedUtilisationPercent: number
  intentKey: string
}
