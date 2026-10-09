/**
 * Verifies provider-independent entitlement normalization used by AuthContext.
 * @module contexts/AuthContext.test
 */

import { describe, expect, it } from 'vitest'
import { normalizeSuperAdminEmails, resolveSuperAdminEmails } from '../config/firebase'
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

  it('normalizes and deduplicates comma-separated administrator settings', () => {
    expect(normalizeSuperAdminEmails(
      ' FIRST-OWNER@example.com, ,SECOND-OWNER@example.com,,first-owner@example.com ',
      [' legacy@example.com ', null, 42],
      '',
    )).toEqual([
      'first-owner@example.com',
      'second-owner@example.com',
      'legacy@example.com',
    ])
  })

  it('fails closed for malformed entries and does not revive legacy access', () => {
    expect(normalizeSuperAdminEmails('valid@example.com,invalid,@example.com,owner@localhost,,')).toEqual([
      'valid@example.com',
    ])
    expect(resolveSuperAdminEmails('invalid-entry', 'legacy@example.com')).toEqual([])
  })

  it('uses the plural allowlist in preference to the legacy single-address setting', () => {
    expect(resolveSuperAdminEmails('first-owner@example.com,second-owner@example.com', 'legacy@example.com')).toEqual([
      'first-owner@example.com',
      'second-owner@example.com',
    ])
    expect(resolveSuperAdminEmails('   ', 'legacy@example.com')).toEqual(['legacy@example.com'])
  })

  it('derives browser admin state only from the configured Firebase email allowlist', () => {
    const configuredEmails = ['first-owner@example.com', 'second-owner@example.com']

    expect(isConfiguredSuperAdmin({ email: ' FIRST-OWNER@example.com ', emailVerified: true }, configuredEmails)).toBe(true)
    expect(isConfiguredSuperAdmin({ email: 'second-owner@example.com', emailVerified: false }, configuredEmails)).toBe(true)
    expect(isConfiguredSuperAdmin({ email: 'other@example.com', emailVerified: true, isSuperAdmin: true }, configuredEmails)).toBe(false)
    expect(isConfiguredSuperAdmin({ email: 'first-owner@example.com', emailVerified: true }, ', ,')).toBe(false)
    expect(isConfiguredSuperAdmin({ email: null }, configuredEmails)).toBe(false)
  })
})
