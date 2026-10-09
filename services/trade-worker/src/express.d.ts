/**
 * Extends Express requests with the verified Firebase-to-Supabase identity link.
 * @module express
 */

export interface AccessSnapshot {
  isSuperAdmin: boolean
  trialActive: boolean
  subscriptionActive: boolean
  entitled: boolean
  trialEndAt: string | null
  subscriptionEndAt: string | null
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled'
}

export interface AuthenticatedTradeUser {
  /** Compatibility alias used by existing worker handlers. */
  id: string
  profileId: string
  firebaseUid: string
  email: string
  access: AccessSnapshot
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedTradeUser
    }
  }
}

export {}
