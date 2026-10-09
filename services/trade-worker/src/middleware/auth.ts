/**
 * Verifies Firebase ID tokens, reads authoritative Firestore entitlements, and
 * resolves each Firebase UID to an internal Supabase profile UUID.
 * @module middleware/auth
 */

import type { NextFunction, Request, Response } from 'express'
import type { AccessSnapshot } from '../express.js'
import type { FirebaseIdentitySource, VerifiedFirebaseToken } from '../lib/firebase.js'
import type { SupabaseAdmin } from '../lib/supabase.js'

const SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'expired', 'cancelled'])

export interface FirebaseAuthOptions {
  superadminEmail?: string
}

export interface AuthoritativeFirebaseProfile {
  firebaseUid: string
  email: string
  name: string
  phone: string
  trialStartAt: string | null
  trialEndAt: string | null
  isTrialActive: boolean
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled'
  subscriptionPlan: string | null
  subscriptionEndAt: string | null
  access: AccessSnapshot
}

/**
 * Converts Firestore Timestamp variants, Date, epoch, and ISO values to epoch
 * milliseconds while rejecting malformed values.
 */
export function parseFirestoreInstant(value: unknown): number {
  if (value == null) return Number.NaN
  if (typeof value === 'object') {
    const timestamp = value as {
      toMillis?: () => number
      toDate?: () => Date
      seconds?: number
      nanoseconds?: number
      _seconds?: number
      _nanoseconds?: number
    }
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis()
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime()
    const seconds = Number(timestamp.seconds ?? timestamp._seconds)
    const nanoseconds = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0)
    if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return (seconds * 1000) + (nanoseconds / 1e6)
  }
  if (typeof value === 'number') return Math.abs(value) < 1e12 ? value * 1000 : value
  if (typeof value === 'string') return new Date(value).getTime()
  if (value instanceof Date) return value.getTime()
  return Number.NaN
}

/**
 * Converts a supported timestamp into a database-safe ISO string.
 */
function toIsoInstant(value: unknown): string | null {
  const milliseconds = parseFirestoreInstant(value)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null
}

/**
 * Returns a bounded string from an untyped Firestore field.
 */
function profileString(value: unknown, maximumLength: number): string {
  return typeof value === 'string' ? value.slice(0, maximumLength) : ''
}

/**
 * Computes the server-authoritative access snapshot. Administrator authority
 * comes only from the normalized Firebase token email matching server-only
 * configuration; mutable or legacy Firestore profile fields are never trusted.
 */
export function buildAuthoritativeFirebaseProfile(
  token: VerifiedFirebaseToken,
  profile: Record<string, unknown>,
  options: FirebaseAuthOptions = {},
  nowMs = Date.now(),
): AuthoritativeFirebaseProfile {
  const email = token.email || profileString(profile.email, 320)
  const normalizedConfiguredAdmin = options.superadminEmail?.trim().toLowerCase() || ''
  const isSuperAdmin = Boolean(
    normalizedConfiguredAdmin
    && token.email?.trim().toLowerCase() === normalizedConfiguredAdmin,
  )
  const trialEndAt = toIsoInstant(profile.trialEndDate)
  const subscriptionEndAt = toIsoInstant(profile.subscriptionEndDate)
  const subscriptionStatusValue = profileString(profile.subscriptionStatus, 32)
  const subscriptionStatus = SUBSCRIPTION_STATUSES.has(subscriptionStatusValue)
    ? subscriptionStatusValue as AuthoritativeFirebaseProfile['subscriptionStatus']
    : 'trial'
  const isTrialActive = profile.isTrialActive === true
  const trialActive = isTrialActive && Boolean(trialEndAt) && Date.parse(trialEndAt as string) > nowMs
  const subscriptionActive = subscriptionStatus === 'active'
    && Boolean(subscriptionEndAt)
    && Date.parse(subscriptionEndAt as string) > nowMs
  return {
    firebaseUid: token.uid,
    email,
    name: profileString(profile.name, 200),
    phone: profileString(profile.phone, 64),
    trialStartAt: toIsoInstant(profile.trialStartDate),
    trialEndAt,
    isTrialActive,
    subscriptionStatus,
    subscriptionPlan: profileString(profile.subscriptionPlan, 120) || null,
    subscriptionEndAt,
    access: {
      isSuperAdmin,
      trialActive,
      subscriptionActive,
      entitled: isSuperAdmin || trialActive || subscriptionActive,
      trialEndAt,
      subscriptionEndAt,
      subscriptionStatus,
    },
  }
}

/**
 * Atomically creates or refreshes the internal UUID linked to one Firebase UID.
 */
export async function resolveSupabaseProfile(
  supabase: SupabaseAdmin,
  profile: AuthoritativeFirebaseProfile,
): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_firebase_profile', {
    p_firebase_uid: profile.firebaseUid,
    p_email: profile.email,
    p_name: profile.name,
    p_phone: profile.phone,
    p_trial_start_at: profile.trialStartAt,
    p_trial_end_at: profile.trialEndAt,
    p_is_trial_active: profile.isTrialActive,
    p_subscription_status: profile.subscriptionStatus,
    p_subscription_plan: profile.subscriptionPlan,
    p_subscription_end_at: profile.subscriptionEndAt,
    p_is_super_admin: profile.access.isSuperAdmin,
  })
  if (error) throw error
  const profileId = typeof data === 'string'
    ? data
    : Array.isArray(data)
      ? String(data[0]?.resolve_firebase_profile || data[0] || '')
      : String((data as { resolve_firebase_profile?: unknown } | null)?.resolve_firebase_profile || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new Error('Firebase profile resolution returned an invalid internal identifier.')
  }
  return profileId
}

/**
 * Verifies a non-revoked Firebase token, loads Firestore access, and attaches the
 * least-privilege identity context used by all authenticated worker handlers.
 */
export function requireUser(
  firebaseIdentity: FirebaseIdentitySource,
  supabase: SupabaseAdmin,
  options: FirebaseAuthOptions = {},
) {
  return async function authenticate(request: Request, response: Response, next: NextFunction) {
    const authorization = request.header('authorization')
    const tokenValue = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!tokenValue) {
      response.status(401).json({ error: 'Authentication is required.' })
      return
    }

    let verifiedToken: VerifiedFirebaseToken
    try {
      verifiedToken = await firebaseIdentity.verifyIdToken(tokenValue, true)
    } catch {
      response.status(401).json({ error: 'The Firebase session is invalid, revoked, or expired.' })
      return
    }

    try {
      const sourceProfile = await firebaseIdentity.getUserProfile(verifiedToken.uid)
      if (!sourceProfile) {
        response.status(403).json({ error: 'A Firebase Stride profile is required.' })
        return
      }
      const authoritativeProfile = buildAuthoritativeFirebaseProfile(verifiedToken, sourceProfile, options)
      const profileId = await resolveSupabaseProfile(supabase, authoritativeProfile)
      request.user = {
        id: profileId,
        profileId,
        firebaseUid: verifiedToken.uid,
        email: authoritativeProfile.email,
        access: authoritativeProfile.access,
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Enforces the already verified Firestore access snapshot at the API boundary.
 */
export function requireActiveAccess() {
  return function authorize(request: Request, response: Response, next: NextFunction) {
    if (!request.user) {
      response.status(401).json({ error: 'Authentication is required.' })
      return
    }
    if (!request.user.access.entitled) {
      response.status(403).json({ error: 'The Stride trial or subscription has expired.' })
      return
    }
    next()
  }
}
