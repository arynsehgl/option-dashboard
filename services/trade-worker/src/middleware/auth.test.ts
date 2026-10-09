/**
 * Verifies Firebase token enforcement, Firestore entitlement evaluation, and
 * internal Supabase profile linking at the worker boundary.
 * @module middleware/auth.test
 */

import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { FirebaseIdentitySource } from '../lib/firebase.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import {
  buildAuthoritativeFirebaseProfile,
  parseFirestoreInstant,
  requireActiveAccess,
  requireUser,
} from './auth.js'

const PROFILE_UUID = '31a7415b-b537-4d37-94eb-724df8cb33a4'

/**
 * Creates the minimal Express response double required by the middleware.
 */
function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

/**
 * Creates an identity source containing an expired trial and active subscription.
 */
function createIdentity(overrides: Partial<FirebaseIdentitySource> = {}): FirebaseIdentitySource {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: 'firebase-user-1',
      email: 'owner@example.com',
      emailVerified: true,
    }),
    getUserIdentity: vi.fn().mockResolvedValue({
      uid: 'firebase-user-1',
      email: 'owner@example.com',
      emailVerified: true,
    }),
    getUserProfile: vi.fn().mockResolvedValue({
      name: 'Existing V1 User',
      phone: '+919876543210',
      trialStartDate: '2026-01-01T00:00:00.000Z',
      trialEndDate: '2026-01-04T00:00:00.000Z',
      isTrialActive: true,
      subscriptionStatus: 'active',
      subscriptionPlan: 'pro',
      subscriptionEndDate: '2099-01-01T00:00:00.000Z',
    }),
    checkReadiness: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/**
 * Creates the narrow Supabase RPC double used to resolve an internal UUID.
 */
function createSupabase() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: PROFILE_UUID, error: null }),
  } as unknown as SupabaseAdmin
}

describe('Firebase worker authentication', () => {
  it('normalizes Firestore timestamp representations', () => {
    const instant = Date.parse('2026-10-09T10:00:00.500Z')
    expect(parseFirestoreInstant({ seconds: Math.floor(instant / 1000), nanoseconds: 500000000 })).toBe(instant)
    expect(parseFirestoreInstant({ toMillis: () => instant })).toBe(instant)
    expect(parseFirestoreInstant('invalid')).toBeNaN()
  })

  it('ignores Firestore administrator fields when the token email does not match configuration', () => {
    const token = {
      uid: 'firebase-user-1',
      email: 'member@example.com',
      emailVerified: false,
    }
    const expiredProfile = { isTrialActive: false, subscriptionStatus: 'expired' }
    expect(buildAuthoritativeFirebaseProfile(token, {
      ...expiredProfile,
      isSuperAdmin: true,
    }, { superadminEmails: ['owner@example.com', 'second-owner@example.com'] }).access).toEqual(expect.objectContaining({
      isSuperAdmin: false,
      entitled: false,
    }))
    expect(buildAuthoritativeFirebaseProfile(token, {
      ...expiredProfile,
      isSuperAdmin: 'true',
    }, { superadminEmails: ['owner@example.com', 'second-owner@example.com'] }).access).toEqual(expect.objectContaining({
      isSuperAdmin: false,
      entitled: false,
    }))
    expect(buildAuthoritativeFirebaseProfile({ ...token, email: undefined }, {
      ...expiredProfile,
      email: 'owner@example.com',
      isSuperAdmin: true,
    }, { superadminEmails: ['owner@example.com'] }).access).toEqual(expect.objectContaining({
      isSuperAdmin: false,
      entitled: false,
    }))
  })

  it('grants each normalized configured token email using exact matches only', () => {
    const source = { isSuperAdmin: false, isTrialActive: false, subscriptionStatus: 'expired' }
    const options = { superadminEmails: ['owner@example.com', ' second-owner@example.com '] }
    expect(buildAuthoritativeFirebaseProfile({ uid: 'one', email: 'owner@example.com', emailVerified: false }, source, options).access.isSuperAdmin).toBe(true)
    expect(buildAuthoritativeFirebaseProfile({ uid: 'two', email: 'SECOND-OWNER@example.com', emailVerified: true }, source, options).access.isSuperAdmin).toBe(true)
    expect(buildAuthoritativeFirebaseProfile({ uid: 'three', email: 'owner@example.com.attacker.test', emailVerified: true }, source, options).access.isSuperAdmin).toBe(false)
  })

  it('propagates a configured administrator through worker identity resolution', async () => {
    const firebaseIdentity = createIdentity({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'firebase-user-1',
        email: 'owner@example.com',
        emailVerified: false,
      }),
      getUserProfile: vi.fn().mockResolvedValue({
        name: 'Configured Administrator',
        phone: '+919876543210',
        trialStartDate: '2025-01-01T00:00:00.000Z',
        trialEndDate: '2025-01-04T00:00:00.000Z',
        isTrialActive: false,
        subscriptionStatus: 'expired',
        subscriptionPlan: null,
        subscriptionEndDate: null,
        isSuperAdmin: false,
      }),
    })
    const supabase = createSupabase()
    const request = {
      header: vi.fn().mockReturnValue('Bearer firebase-id-token'),
    } as unknown as Request
    const response = createResponse()
    const next = vi.fn() as NextFunction

    await requireUser(firebaseIdentity, supabase, { superadminEmails: ['first-owner@example.com', ' OWNER@example.com '] })(request, response, next)

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_firebase_profile', expect.objectContaining({
      p_is_super_admin: true,
    }))
    expect(request.user?.access).toEqual(expect.objectContaining({
      isSuperAdmin: true,
      entitled: true,
    }))
    expect(next).toHaveBeenCalledWith()
  })

  it('verifies revocation, links the internal profile, and preserves active subscriptions', async () => {
    const firebaseIdentity = createIdentity()
    const supabase = createSupabase()
    const request = {
      header: vi.fn().mockReturnValue('Bearer firebase-id-token'),
    } as unknown as Request
    const response = createResponse()
    const next = vi.fn() as NextFunction

    await requireUser(firebaseIdentity, supabase, { superadminEmails: ['admin@example.com'] })(request, response, next)

    expect(firebaseIdentity.verifyIdToken).toHaveBeenCalledWith('firebase-id-token', true)
    expect(supabase.rpc).toHaveBeenCalledWith('resolve_firebase_profile', expect.objectContaining({
      p_firebase_uid: 'firebase-user-1',
      p_subscription_status: 'active',
      p_is_super_admin: false,
    }))
    expect(request.user).toEqual(expect.objectContaining({
      id: PROFILE_UUID,
      profileId: PROFILE_UUID,
      firebaseUid: 'firebase-user-1',
      access: expect.objectContaining({ subscriptionActive: true, entitled: true }),
    }))
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects missing and revoked tokens without querying account data', async () => {
    const response = createResponse()
    const next = vi.fn() as NextFunction
    const missingIdentity = createIdentity()
    await requireUser(missingIdentity, createSupabase())({ header: vi.fn() } as unknown as Request, response, next)
    expect(response.status).toHaveBeenCalledWith(401)
    expect(missingIdentity.verifyIdToken).not.toHaveBeenCalled()

    const revokedIdentity = createIdentity({ verifyIdToken: vi.fn().mockRejectedValue(new Error('revoked')) })
    const revokedResponse = createResponse()
    await requireUser(revokedIdentity, createSupabase())({ header: vi.fn().mockReturnValue('Bearer revoked') } as unknown as Request, revokedResponse, next)
    expect(revokedResponse.status).toHaveBeenCalledWith(401)
  })

  it('rejects an authenticated Firebase account without its V1 Firestore profile', async () => {
    const response = createResponse()
    const next = vi.fn() as NextFunction
    const identity = createIdentity({ getUserProfile: vi.fn().mockResolvedValue(null) })
    await requireUser(identity, createSupabase())({ header: vi.fn().mockReturnValue('Bearer valid') } as unknown as Request, response, next)
    expect(response.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('enforces the attached authoritative entitlement snapshot', () => {
    const response = createResponse()
    const next = vi.fn() as NextFunction
    const request = {
      user: {
        id: PROFILE_UUID,
        profileId: PROFILE_UUID,
        firebaseUid: 'firebase-user-1',
        email: 'owner@example.com',
        access: {
          isSuperAdmin: false,
          trialActive: false,
          subscriptionActive: false,
          entitled: false,
          trialEndAt: null,
          subscriptionEndAt: null,
          subscriptionStatus: 'expired',
        },
      },
    } as Request
    requireActiveAccess()(request, response, next)
    expect(response.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
