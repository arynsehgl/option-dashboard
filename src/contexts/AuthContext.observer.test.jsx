/**
 * Verifies that Firebase observer failures cannot leave the application behind
 * a permanent authentication loading screen.
 * @module contexts/AuthContext.observer.test
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  getDoc: vi.fn().mockRejectedValue(new Error('Firestore unavailable')),
  onAuthStateChanged: vi.fn((_auth, onUser) => {
    queueMicrotask(() => onUser({ uid: 'existing-firebase-user', email: 'user@example.com' }))
    return vi.fn()
  }),
}))

vi.mock('../config/firebase', () => ({
  auth: { name: 'firebase-auth' },
  db: { name: 'firestore' },
  googleProvider: { name: 'google' },
  isFirebaseConfigured: true,
  SUPERADMIN_EMAIL: 'admin@example.com',
}))

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  onAuthStateChanged: firebaseMocks.onAuthStateChanged,
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'users/existing-firebase-user' })),
  getDoc: firebaseMocks.getDoc,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: { fromMillis: vi.fn((milliseconds) => ({ milliseconds })) },
}))

import { AuthProvider, useAuth } from './AuthContext'

/**
 * Displays the settled provider state once AuthProvider releases its children.
 */
function AuthStateProbe() {
  const { loading, currentUser, userData } = useAuth()
  return <p>{loading ? 'loading' : `settled:${currentUser?.uid}:${userData ? 'profile' : 'no-profile'}`}</p>
}

describe('AuthContext observer lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('settles loading and clears profile state when Firestore loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AuthProvider><AuthStateProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('settled:existing-firebase-user:no-profile')).toBeInTheDocument())
    expect(firebaseMocks.getDoc).toHaveBeenCalledOnce()
  })
})
