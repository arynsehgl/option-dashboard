/**
 * Regression tests for Firebase account and Admin readiness fail-closed gates.
 * @module lib/firebase.test
 */

import { describe, expect, it, vi } from 'vitest'
import { assertFirebaseAccountEnabled, assertFirebaseAdminReady } from './firebase.js'

describe('Firebase Admin safety gates', () => {
  it('rejects disabled Firebase accounts', () => {
    expect(() => assertFirebaseAccountEnabled(true)).toThrow('Firebase account is disabled')
    expect(() => assertFirebaseAccountEnabled(false)).not.toThrow()
  })

  it('accepts the expected missing readiness sentinel after checking Firestore', async () => {
    const firestoreProbe = vi.fn().mockResolvedValue(undefined)
    await expect(assertFirebaseAdminReady(
      vi.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
      firestoreProbe,
    )).resolves.toBeUndefined()
    expect(firestoreProbe).toHaveBeenCalledOnce()
  })

  it('rejects Auth and Firestore permission failures', async () => {
    await expect(assertFirebaseAdminReady(
      vi.fn().mockRejectedValue({ code: 'auth/insufficient-permission' }),
      vi.fn(),
    )).rejects.toThrow('Firebase Auth readiness check failed')
    await expect(assertFirebaseAdminReady(
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockRejectedValue(new Error('permission denied')),
    )).rejects.toThrow('Firestore readiness check failed')
  })
})
