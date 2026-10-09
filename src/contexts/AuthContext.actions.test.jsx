/**
 * Verifies Firebase signup rollback, Google new-user handling, and password-reset
 * privacy through the public AuthContext actions.
 * @module contexts/AuthContext.actions.test
 */

import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  getDoc: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setDoc: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('../config/firebase', () => ({
  auth: { currentUser: null },
  db: { name: 'firestore' },
  googleProvider: { name: 'google' },
  isFirebaseConfigured: true,
  SUPERADMIN_EMAIL: 'owner@example.com',
}))

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: authMocks.createUserWithEmailAndPassword,
  deleteUser: authMocks.deleteUser,
  getAdditionalUserInfo: authMocks.getAdditionalUserInfo,
  onAuthStateChanged: authMocks.onAuthStateChanged,
  sendPasswordResetEmail: authMocks.sendPasswordResetEmail,
  signInWithEmailAndPassword: authMocks.signInWithEmailAndPassword,
  signInWithPopup: authMocks.signInWithPopup,
  signOut: authMocks.signOut,
  updateProfile: authMocks.updateProfile,
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, uid) => ({ path: `${collection}/${uid}` })),
  getDoc: authMocks.getDoc,
  serverTimestamp: vi.fn(() => ({ operation: 'serverTimestamp' })),
  setDoc: authMocks.setDoc,
  Timestamp: { fromMillis: vi.fn((milliseconds) => ({ milliseconds })) },
}))

import { AuthProvider, useAuth } from './AuthContext'

let authContext
let emitAuthState

/** Creates a controllable promise for authentication race regressions. */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** Builds a Firestore profile snapshot for one Firebase identity. */
function profileSnapshot(uid) {
  return { exists: () => true, data: () => ({ uid, name: uid }) }
}

/**
 * Captures the current provider value for direct action testing.
 */
function AuthActionsProbe() {
  authContext = useAuth()
  return <p>ready</p>
}

/**
 * Mounts a settled provider with no initial Firebase session.
 */
async function renderAuthProvider() {
  render(<AuthProvider><AuthActionsProbe /></AuthProvider>)
  await waitFor(() => expect(authContext?.loading).toBe(false))
}

describe('AuthContext account actions', () => {
  beforeEach(() => {
    authContext = null
    emitAuthState = null
    vi.clearAllMocks()
    authMocks.onAuthStateChanged.mockImplementation((_auth, onUser) => {
      emitAuthState = onUser
      queueMicrotask(() => onUser(null))
      return vi.fn()
    })
    authMocks.deleteUser.mockResolvedValue(undefined)
    authMocks.signOut.mockResolvedValue(undefined)
    authMocks.updateProfile.mockResolvedValue(undefined)
    authMocks.setDoc.mockResolvedValue(undefined)
    authMocks.sendPasswordResetEmail.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('validates Firestore field bounds before creating an email Auth account', async () => {
    await renderAuthProvider()
    await expect(authContext.signup('user@example.com', 'password', 'x'.repeat(121), '+91')).rejects.toThrow('120 characters or fewer')
    expect(authMocks.createUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('deletes and signs out a fresh email Auth user when profile creation fails', async () => {
    const user = { uid: 'new-email-user', email: 'user@example.com', displayName: null }
    authMocks.createUserWithEmailAndPassword.mockResolvedValue({ user })
    authMocks.setDoc.mockRejectedValueOnce(new Error('rules denied'))
    await renderAuthProvider()

    await expect(authContext.signup(' user@example.com ', 'password', ' User Name ', ' +91 ')).rejects.toThrow('rolled back')
    expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'user@example.com', 'password')
    expect(authMocks.deleteUser).toHaveBeenCalledWith(user)
    expect(authMocks.signOut).toHaveBeenCalled()
  })

  it('does not silently create a missing profile during ordinary email login', async () => {
    const user = { uid: 'orphan-email-user', email: 'user@example.com', emailVerified: true }
    authMocks.signInWithEmailAndPassword.mockResolvedValue({ user })
    authMocks.getDoc.mockResolvedValue({ exists: () => false })
    await renderAuthProvider()

    await expect(authContext.login('user@example.com', 'password')).rejects.toThrow('does not have a Stride profile')
    expect(authMocks.setDoc).not.toHaveBeenCalled()
    expect(authMocks.signOut).toHaveBeenCalled()
  })

  it('uses official Google new-user metadata and bounds provider profile values', async () => {
    const user = { uid: 'new-google-user', email: 'google@example.com', displayName: `  ${'G'.repeat(150)}  `, emailVerified: true }
    const result = { user }
    authMocks.signInWithPopup.mockResolvedValue(result)
    authMocks.getAdditionalUserInfo.mockReturnValue({ isNewUser: true })
    authMocks.getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ email: user.email }) })
    await renderAuthProvider()

    await act(async () => authContext.signInWithGoogle(true))
    expect(authMocks.getAdditionalUserInfo).toHaveBeenCalledWith(result)
    expect(authMocks.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'G'.repeat(120), phone: '', isSuperAdmin: false }),
    )
    expect(authMocks.deleteUser).not.toHaveBeenCalled()
  })

  it('cleans up only a genuinely new Google Auth user after profile failure', async () => {
    const newUser = { uid: 'new-google-user', email: 'new@example.com', displayName: 'New User' }
    authMocks.signInWithPopup.mockResolvedValue({ user: newUser })
    authMocks.getAdditionalUserInfo.mockReturnValue({ isNewUser: true })
    authMocks.getDoc.mockResolvedValue({ exists: () => false })
    authMocks.setDoc.mockRejectedValueOnce(new Error('rules denied'))
    await renderAuthProvider()
    await expect(authContext.signInWithGoogle(true)).rejects.toThrow('profile setup failed')
    expect(authMocks.deleteUser).toHaveBeenCalledWith(newUser)

    vi.clearAllMocks()
    const existingUser = { uid: 'existing-google-user', email: 'existing@example.com', displayName: 'Existing User' }
    authMocks.signInWithPopup.mockResolvedValue({ user: existingUser })
    authMocks.getAdditionalUserInfo.mockReturnValue({ isNewUser: false })
    authMocks.getDoc.mockResolvedValue({ exists: () => false })
    authMocks.setDoc.mockRejectedValueOnce(new Error('rules denied'))
    authMocks.signOut.mockResolvedValue(undefined)
    await expect(authContext.signInWithGoogle(true)).rejects.toThrow('profile setup failed')
    expect(authMocks.deleteUser).not.toHaveBeenCalled()
    expect(authMocks.signOut).toHaveBeenCalled()
  })

  it('normalizes user-not-found password reset while preserving operational errors', async () => {
    await renderAuthProvider()
    authMocks.sendPasswordResetEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' })
    await expect(authContext.resetPassword(' missing@example.com ')).resolves.toBeUndefined()
    expect(authMocks.sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'missing@example.com')

    authMocks.sendPasswordResetEmail.mockRejectedValueOnce(Object.assign(new Error('network unavailable'), { code: 'auth/network-request-failed' }))
    await expect(authContext.resetPassword('user@example.com')).rejects.toThrow('network unavailable')
  })

  it('ignores an account A observer result that resolves after account B', async () => {
    const accountA = deferred()
    const accountB = deferred()
    authMocks.getDoc.mockImplementation((reference) => reference.path.endsWith('/account-a') ? accountA.promise : accountB.promise)
    await renderAuthProvider()

    let accountALoad
    let accountBLoad
    act(() => {
      accountALoad = emitAuthState({ uid: 'account-a', email: 'a@example.com', emailVerified: true })
      accountBLoad = emitAuthState({ uid: 'account-b', email: 'b@example.com', emailVerified: true })
    })
    await act(async () => {
      accountB.resolve(profileSnapshot('account-b'))
      await accountBLoad
    })
    await waitFor(() => expect(authContext.userData?.uid).toBe('account-b'))

    await act(async () => {
      accountA.resolve(profileSnapshot('account-a'))
      await accountALoad
    })
    expect(authContext.currentUser?.uid).toBe('account-b')
    expect(authContext.userData?.uid).toBe('account-b')
  })

  it('invalidates an observer profile load before logout completes', async () => {
    const accountA = deferred()
    authMocks.getDoc.mockReturnValue(accountA.promise)
    await renderAuthProvider()

    let accountALoad
    act(() => {
      accountALoad = emitAuthState({ uid: 'account-a', email: 'a@example.com', emailVerified: true })
    })
    await act(async () => authContext.logout())
    await act(async () => {
      accountA.resolve(profileSnapshot('account-a'))
      await accountALoad
    })

    expect(authContext.currentUser).toBeNull()
    expect(authContext.userData).toBeNull()
  })

  it('prevents an explicit login load from replacing an observer-switched account', async () => {
    const accountA = deferred()
    const accountB = deferred()
    const userA = { uid: 'account-a', email: 'a@example.com', emailVerified: true }
    authMocks.signInWithEmailAndPassword.mockResolvedValue({ user: userA })
    authMocks.getDoc.mockImplementation((reference) => reference.path.endsWith('/account-a') ? accountA.promise : accountB.promise)
    await renderAuthProvider()

    const loginPromise = authContext.login('a@example.com', 'password')
    const loginResult = expect(loginPromise).rejects.toThrow('Authentication changed')
    await waitFor(() => expect(authMocks.getDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/account-a' })))
    let accountBLoad
    act(() => {
      accountBLoad = emitAuthState({ uid: 'account-b', email: 'b@example.com', emailVerified: true })
    })
    await act(async () => {
      accountB.resolve(profileSnapshot('account-b'))
      await accountBLoad
      accountA.resolve(profileSnapshot('account-a'))
      await loginPromise.catch(() => {})
    })

    await loginResult
    expect(authContext.currentUser?.uid).toBe('account-b')
    expect(authContext.userData?.uid).toBe('account-b')
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it('does not let an older same-account login read sign out a newer observer profile', async () => {
    const olderLoginRead = deferred()
    const newerObserverRead = deferred()
    const user = { uid: 'same-account', email: 'same@example.com', emailVerified: true }
    authMocks.signInWithEmailAndPassword.mockResolvedValue({ user })
    authMocks.getDoc
      .mockReturnValueOnce(olderLoginRead.promise)
      .mockReturnValueOnce(newerObserverRead.promise)
    await renderAuthProvider()

    const loginPromise = authContext.login('same@example.com', 'password')
    const loginResult = expect(loginPromise).rejects.toThrow('Authentication changed')
    await waitFor(() => expect(authMocks.getDoc).toHaveBeenCalledTimes(1))
    let observerLoad
    act(() => {
      observerLoad = emitAuthState(user)
    })
    await act(async () => {
      newerObserverRead.resolve(profileSnapshot(user.uid))
      await observerLoad
      olderLoginRead.resolve({ exists: () => false })
      await loginPromise.catch(() => {})
    })

    await loginResult
    expect(authContext.currentUser?.uid).toBe(user.uid)
    expect(authContext.userData?.uid).toBe(user.uid)
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it.each(['signup', 'google'])('prevents an explicit %s profile load from surviving logout', async (actionName) => {
    const accountA = deferred()
    const userA = { uid: `account-a-${actionName}`, email: 'a@example.com', displayName: 'Account A', emailVerified: true }
    if (actionName === 'signup') {
      authMocks.createUserWithEmailAndPassword.mockResolvedValue({ user: userA })
      authMocks.getDoc.mockReturnValue(accountA.promise)
    } else {
      const result = { user: userA }
      authMocks.signInWithPopup.mockResolvedValue(result)
      authMocks.getAdditionalUserInfo.mockReturnValue({ isNewUser: false })
      authMocks.getDoc
        .mockResolvedValueOnce(profileSnapshot(userA.uid))
        .mockReturnValueOnce(accountA.promise)
    }
    await renderAuthProvider()

    const actionPromise = actionName === 'signup'
      ? authContext.signup('a@example.com', 'password', 'Account A', '+91')
      : authContext.signInWithGoogle(false)
    const actionResult = expect(actionPromise).rejects.toThrow('Authentication changed')
    await waitFor(() => expect(authMocks.getDoc).toHaveBeenCalled())
    if (actionName === 'google') await waitFor(() => expect(authMocks.getDoc).toHaveBeenCalledTimes(2))
    await act(async () => authContext.logout())
    await act(async () => {
      accountA.resolve(profileSnapshot(userA.uid))
      await actionPromise.catch(() => {})
    })

    await actionResult
    expect(authContext.currentUser).toBeNull()
    expect(authContext.userData).toBeNull()
  })
})
