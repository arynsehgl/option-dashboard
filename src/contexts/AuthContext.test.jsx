/**
 * Verifies provider-independent entitlement normalization used by AuthContext.
 * @module contexts/AuthContext.test
 */

import { describe, expect, it } from 'vitest'
import {
  isConfiguredSuperAdmin,
  parseAccessInstant,
  profileHasActiveAccess,
  validateSignupProfile,
} from './AuthContext'

describe('AuthContext entitlement helpers', () => {
  const now = Date.parse('2026-10-09T10:00:00.000Z')

  it('normalizes ISO, Firestore Timestamp, and serialized timestamp values', () => {
    expect(parseAccessInstant('2026-10-10T10:00:00.000Z')).toBe(Date.parse('2026-10-10T10:00:00.000Z'))
    expect(parseAccessInstant({ toMillis: () => now + 1000 })).toBe(now + 1000)
    expect(parseAccessInstant({ seconds: now / 1000, nanoseconds: 500000000 })).toBe(now + 500)
  })

  it('keeps an active subscriber entitled after the trial expires', () => {
    expect(profileHasActiveAccess({
      isTrialActive: true,
      trialEndDate: new Date(now - 1000),
      subscriptionStatus: 'active',
      subscriptionEndDate: { toDate: () => new Date(now + 1000) },
    }, false, now)).toBe(true)
  })

  it('accepts either a current trial or the trusted super-admin flag', () => {
    expect(profileHasActiveAccess({
      isTrialActive: true,
      trialEndDate: { _seconds: (now + 1000) / 1000 },
      subscriptionStatus: 'trial',
      subscriptionEndDate: null,
    }, false, now)).toBe(true)
    expect(profileHasActiveAccess(null, true, now)).toBe(true)
  })

  it('rejects invalid, absent, and fully expired entitlement dates', () => {
    expect(profileHasActiveAccess({
      isTrialActive: true,
      trialEndDate: 'invalid',
      subscriptionStatus: 'active',
      subscriptionEndDate: now - 1000,
    }, false, now)).toBe(false)
    expect(profileHasActiveAccess(null, false, now)).toBe(false)
  })

  it('normalizes rules-safe signup fields before creating Firebase Auth', () => {
    expect(validateSignupProfile('  Existing User  ', '  +91 98765 43210  ')).toEqual({
      name: 'Existing User',
      phone: '+91 98765 43210',
    })
    expect(() => validateSignupProfile('x'.repeat(121), '+91')).toThrow('120 characters or fewer')
    expect(() => validateSignupProfile('Existing User', '1'.repeat(33))).toThrow('32 characters or fewer')
  })

  it('derives browser admin state only from the configured Firebase email match', () => {
    expect(isConfiguredSuperAdmin({ email: ' OWNER@example.com ', emailVerified: true }, 'owner@example.com')).toBe(true)
    expect(isConfiguredSuperAdmin({ email: 'owner@example.com', emailVerified: false }, 'owner@example.com')).toBe(true)
    expect(isConfiguredSuperAdmin({ email: 'other@example.com', emailVerified: true }, 'owner@example.com')).toBe(false)
    expect(isConfiguredSuperAdmin({ email: 'owner@example.com', emailVerified: true }, '')).toBe(false)
  })
})
