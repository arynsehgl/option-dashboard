/**
 * Exercises the production Firestore rules against the official local emulator.
 * @module tests/firestore.rules.test
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT_ID = 'demo-stride-rules'
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
let testEnvironment

/**
 * Creates the exact initial profile shape emitted by the V2 Firebase client.
 */
function safeTrialProfile(uid, email, overrides = {}) {
  return {
    uid,
    email,
    name: 'Rules Test User',
    phone: '+91 98765 43210',
    trialStartDate: serverTimestamp(),
    trialEndDate: Timestamp.fromMillis(Date.now() + THREE_DAYS_MS),
    isTrialActive: true,
    subscriptionStatus: 'trial',
    subscriptionPlan: null,
    subscriptionEndDate: null,
    createdAt: serverTimestamp(),
    isSuperAdmin: false,
    ...overrides,
  }
}

/**
 * Returns one Firebase-authenticated Firestore client with an email token claim.
 */
function authenticatedFirestore(uid, email) {
  return testEnvironment.authenticatedContext(uid, { email }).firestore()
}

/**
 * Seeds an existing profile without applying client security rules.
 */
async function seedProfile(uid, data) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), data)
  })
}

beforeAll(async () => {
  const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url))
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile(rulesPath, 'utf8') },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment?.cleanup()
})

describe('Firestore profile rules', () => {
  it('allows an owner to create and read the bounded V2 trial profile', async () => {
    const firestore = authenticatedFirestore('owner', 'owner@example.com')
    const profileReference = doc(firestore, 'users', 'owner')
    await assertSucceeds(setDoc(profileReference, safeTrialProfile('owner', 'owner@example.com')))
    await assertSucceeds(getDoc(profileReference))
  })

  it('denies cross-user reads and unauthenticated reads', async () => {
    await seedProfile('owner', safeTrialProfile('owner', 'owner@example.com', {
      trialStartDate: Timestamp.now(),
      createdAt: Timestamp.now(),
    }))
    await assertFails(getDoc(doc(authenticatedFirestore('attacker', 'attacker@example.com'), 'users', 'owner')))
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'users', 'owner')))
  })

  it('rejects client-selected administrator and subscription entitlement fields', async () => {
    const firestore = authenticatedFirestore('owner', 'owner@example.com')
    await assertFails(setDoc(doc(firestore, 'users', 'owner'), safeTrialProfile('owner', 'owner@example.com', {
      isSuperAdmin: true,
    })))
    await assertFails(setDoc(doc(firestore, 'users', 'owner'), safeTrialProfile('owner', 'owner@example.com', {
      subscriptionStatus: 'active',
      subscriptionPlan: 'pro',
      subscriptionEndDate: Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000)),
    })))
  })

  it('allows display-only updates but rejects entitlement mutation', async () => {
    await seedProfile('owner', safeTrialProfile('owner', 'owner@example.com', {
      trialStartDate: Timestamp.now(),
      createdAt: Timestamp.now(),
    }))
    const profileReference = doc(authenticatedFirestore('owner', 'owner@example.com'), 'users', 'owner')
    await assertSucceeds(updateDoc(profileReference, { name: 'Updated Name', phone: '+91 90000 00000' }))
    await assertFails(updateDoc(profileReference, { subscriptionStatus: 'active' }))
    await assertFails(updateDoc(profileReference, { isSuperAdmin: true }))
  })

  it('rejects oversized profile fields and a trial outside the bounded window', async () => {
    const firestore = authenticatedFirestore('owner', 'owner@example.com')
    await assertFails(setDoc(doc(firestore, 'users', 'owner'), safeTrialProfile('owner', 'owner@example.com', {
      name: 'x'.repeat(121),
    })))
    await assertFails(setDoc(doc(firestore, 'users', 'owner'), safeTrialProfile('owner', 'owner@example.com', {
      trialEndDate: Timestamp.fromMillis(Date.now() + (10 * 24 * 60 * 60 * 1000)),
    })))
  })

  it('keeps existing V1 ISO-date profiles readable and display-editable', async () => {
    await seedProfile('legacy-owner', {
      uid: 'legacy-owner',
      email: 'legacy@example.com',
      name: 'Legacy User',
      phone: '+91 98765 43210',
      trialStartDate: Timestamp.now(),
      trialEndDate: '2026-10-12T10:00:00.000Z',
      isTrialActive: true,
      subscriptionStatus: 'active',
      subscriptionPlan: 'legacy-pro',
      subscriptionEndDate: '2027-10-12T10:00:00.000Z',
      createdAt: Timestamp.now(),
      isSuperAdmin: false,
    })
    const profileReference = doc(authenticatedFirestore('legacy-owner', 'legacy@example.com'), 'users', 'legacy-owner')
    await assertSucceeds(getDoc(profileReference))
    await assertSucceeds(updateDoc(profileReference, { name: 'Legacy User Updated', phone: '+91 90000 00000' }))
  })
})
