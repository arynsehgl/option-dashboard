/**
 * Provides the Firebase authentication and Firestore entitlement state shared by
 * the V1 Dashboard and the V2 Trade Zone.
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { auth, db, googleProvider, isFirebaseConfigured, SUPERADMIN_EMAIL } from '../config/firebase'

const AuthContext = createContext(null)
const isLocalPreviewEnabled = import.meta.env.DEV && !isFirebaseConfigured
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const PROFILE_NAME_MAX_LENGTH = 120
const PROFILE_PHONE_MAX_LENGTH = 32
const STALE_PROFILE_LOAD = Symbol('stale-profile-load')
const previewUser = Object.freeze({
  uid: 'stride-local-preview',
  id: 'stride-local-preview',
  email: 'preview@stride.local',
  displayName: 'Local Preview',
})
const previewProfile = Object.freeze({
  ...previewUser,
  name: 'Local Preview',
  isTrialActive: true,
  trialEndDate: '2099-12-31T23:59:59.999Z',
  subscriptionStatus: 'preview',
  subscriptionPlan: 'local-preview',
  subscriptionEndDate: '2099-12-31T23:59:59.999Z',
  isSuperAdmin: true,
})

/**
 * Throws a useful error when Firebase is unavailable outside local preview.
 */
function requireFirebaseConfiguration() {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Authentication is not configured. Add the Firebase environment values and restart the app.')
  }
}

/**
 * Converts supported Firestore Timestamp, Date, numeric, and ISO values into
 * epoch milliseconds, returning NaN for invalid or absent values.
 */
export function parseAccessInstant(value) {
  if (value == null) return Number.NaN
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds)
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0)
    if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return (seconds * 1000) + (nanoseconds / 1e6)
  }
  if (typeof value === 'number') return Math.abs(value) < 1e12 ? value * 1000 : value
  return new Date(value).getTime()
}

/**
 * Evaluates an entitlement without mutating Firestore during React rendering.
 * An active subscription remains valid even when an earlier trial has expired.
 */
export function profileHasActiveAccess(profile, superAdmin = false, nowMs = Date.now()) {
  if (superAdmin) return true
  if (!profile) return false
  const trialActive = profile.isTrialActive === true && parseAccessInstant(profile.trialEndDate) > nowMs
  const subscriptionActive = profile.subscriptionStatus === 'active'
    && parseAccessInstant(profile.subscriptionEndDate) > nowMs
  return trialActive || subscriptionActive
}

/**
 * Trims and validates user-entered profile fields before Firebase Auth creates
 * an account, keeping the write compatible with the production Firestore rules.
 */
export function validateSignupProfile(name, phone) {
  const normalizedName = String(name || '').trim()
  const normalizedPhone = String(phone || '').trim()
  if (!normalizedName) throw new Error('Enter your full name before creating an account.')
  if (!normalizedPhone) throw new Error('Enter your phone number before creating an account.')
  if (normalizedName.length > PROFILE_NAME_MAX_LENGTH) {
    throw new Error(`Full name must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`)
  }
  if (normalizedPhone.length > PROFILE_PHONE_MAX_LENGTH) {
    throw new Error(`Phone number must be ${PROFILE_PHONE_MAX_LENGTH} characters or fewer.`)
  }
  return { name: normalizedName, phone: normalizedPhone }
}

/**
 * Bounds identity-provider profile text that the user did not type into the
 * Stride form so Google signup always satisfies the same Firestore rules.
 */
function boundProviderProfileValue(value, maximumLength) {
  return String(value || '').trim().slice(0, maximumLength)
}

/**
 * Grants browser-only administrator presentation state from the authenticated
 * Firebase identity, never from mutable or legacy Firestore document fields.
 */
export function isVerifiedConfiguredSuperAdmin(user, configuredEmail = SUPERADMIN_EMAIL) {
  const normalizedConfiguredEmail = String(configuredEmail || '').trim().toLowerCase()
  return Boolean(
    normalizedConfiguredEmail
    && user?.emailVerified === true
    && user?.email?.trim().toLowerCase() === normalizedConfiguredEmail,
  )
}

/**
 * Returns the shared authentication context.
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

/**
 * Creates the safe initial Firestore profile used by email and Google signup.
 * Authoritative subscription and administrator fields are never client-selected.
 */
function createInitialProfile(user, name = '', phone = '') {
  return {
    uid: user.uid,
    email: user.email || '',
    name: boundProviderProfileValue(name || user.displayName, PROFILE_NAME_MAX_LENGTH),
    phone: boundProviderProfileValue(phone, PROFILE_PHONE_MAX_LENGTH),
    trialStartDate: serverTimestamp(),
    trialEndDate: Timestamp.fromMillis(Date.now() + THREE_DAYS_MS),
    isTrialActive: true,
    subscriptionStatus: 'trial',
    subscriptionPlan: null,
    subscriptionEndDate: null,
    createdAt: serverTimestamp(),
    isSuperAdmin: false,
  }
}

/**
 * Best-effort rollback for an Auth identity created during a profile write that
 * did not complete. Deletion requires the fresh authentication established by
 * the immediately preceding signup operation.
 */
async function rollbackFreshFirebaseUser(user) {
  let deletionError = null
  try {
    await deleteUser(user)
  } catch (error) {
    deletionError = error
  }
  try {
    if (!auth.currentUser || auth.currentUser.uid === user.uid) await signOut(auth)
  } catch {
    // The account deletion may already have cleared the active Firebase session.
  }
  return deletionError
}

/**
 * Provides Firebase-only authentication so every existing V1 account, password,
 * Google identity, and Firestore subscription continues unchanged in V2.
 */
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const activeUidRef = useRef(null)
  const authGenerationRef = useRef(0)
  const profileLoadGenerationRef = useRef(0)
  const provider = isFirebaseConfigured ? 'firebase' : isLocalPreviewEnabled ? 'preview' : 'unconfigured'

  /**
   * Selects the active Firebase identity and invalidates every profile request
   * started for a different account.
   */
  function selectAuthenticatedUser(user) {
    const nextUid = user?.uid || null
    if (activeUidRef.current !== nextUid) {
      activeUidRef.current = nextUid
      authGenerationRef.current += 1
      profileLoadGenerationRef.current += 1
      setUserData(null)
      setIsSuperAdmin(false)
    }
    setCurrentUser(user || null)
    return authGenerationRef.current
  }

  /**
   * Immediately clears local identity state and invalidates pending profile
   * requests before an asynchronous Firebase sign-out can complete.
   */
  function invalidateAuthenticatedUser() {
    activeUidRef.current = null
    authGenerationRef.current += 1
    profileLoadGenerationRef.current += 1
    setCurrentUser(null)
    setUserData(null)
    setIsSuperAdmin(false)
  }

  /** Returns whether an asynchronous action still owns the active identity. */
  function isCurrentIdentity(uid, generation) {
    return activeUidRef.current === uid && authGenerationRef.current === generation
  }

  /**
   * Loads one Firebase user's authoritative Firestore profile, committing it
   * only while both the identity and request generation remain current.
   */
  async function loadUserData(userOrUid, expectedAuthGeneration = authGenerationRef.current) {
    if (isLocalPreviewEnabled) {
      setUserData(previewProfile)
      setIsSuperAdmin(true)
      return previewProfile
    }

    requireFirebaseConfiguration()
    const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid
    const authenticatedUser = typeof userOrUid === 'object'
      ? userOrUid
      : auth.currentUser?.uid === uid
        ? auth.currentUser
        : null
    if (!uid) return null
    if (!isCurrentIdentity(uid, expectedAuthGeneration)) return STALE_PROFILE_LOAD
    const loadGeneration = profileLoadGenerationRef.current + 1
    profileLoadGenerationRef.current = loadGeneration
    const userSnapshot = await getDoc(doc(db, 'users', uid))
    if (!isCurrentIdentity(uid, expectedAuthGeneration)) return STALE_PROFILE_LOAD
    if (profileLoadGenerationRef.current !== loadGeneration) return STALE_PROFILE_LOAD
    if (!userSnapshot.exists()) {
      setUserData(null)
      setIsSuperAdmin(false)
      return null
    }
    const data = userSnapshot.data()
    const superAdmin = isVerifiedConfiguredSuperAdmin(authenticatedUser)
    setUserData(data)
    setIsSuperAdmin(superAdmin)
    return data
  }

  /**
   * Creates a Firebase account and its constrained three-day Firestore trial.
   */
  async function signup(email, password, name, phone) {
    if (isLocalPreviewEnabled) {
      setCurrentUser(previewUser)
      setUserData(previewProfile)
      setIsSuperAdmin(true)
      return { user: previewUser }
    }

    requireFirebaseConfiguration()
    const normalizedProfile = validateSignupProfile(name, phone)
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    const user = credential.user
    const authGeneration = selectAuthenticatedUser(user)
    try {
      await updateProfile(user, { displayName: normalizedProfile.name })
      await setDoc(doc(db, 'users', user.uid), createInitialProfile(user, normalizedProfile.name, normalizedProfile.phone))
    } catch (profileError) {
      if (!isCurrentIdentity(user.uid, authGeneration)) {
        throw new Error('Authentication changed before profile setup completed.', { cause: profileError })
      }
      const rollbackError = await rollbackFreshFirebaseUser(user)
      if (isCurrentIdentity(user.uid, authGeneration)) invalidateAuthenticatedUser()
      if (rollbackError) {
        throw new Error('Your Firebase account was created, but profile setup failed and automatic cleanup was unsuccessful. Please contact support before retrying.', { cause: profileError })
      }
      throw new Error('Profile setup failed, so the new account was rolled back. Please try signing up again.', { cause: profileError })
    }
    const profile = await loadUserData(user, authGeneration)
    if (profile === STALE_PROFILE_LOAD) throw new Error('Authentication changed before profile loading completed.')
    return credential
  }

  /**
   * Signs in with the existing Firebase email-and-password account.
   */
  async function login(email, password) {
    if (isLocalPreviewEnabled) {
      setCurrentUser(previewUser)
      setUserData(previewProfile)
      setIsSuperAdmin(true)
      return { user: previewUser }
    }

    requireFirebaseConfiguration()
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const authGeneration = selectAuthenticatedUser(credential.user)
    const profile = await loadUserData(credential.user, authGeneration)
    if (profile === STALE_PROFILE_LOAD) throw new Error('Authentication changed before profile loading completed.')
    if (!profile) {
      invalidateAuthenticatedUser()
      await signOut(auth)
      throw new Error('This Firebase account does not have a Stride profile. Please contact support.')
    }
    return credential
  }

  /**
   * Signs in with the existing Firebase Google provider and creates only the
   * constrained initial trial when the user explicitly selected sign-up.
   */
  async function signInWithGoogle(isSignUp = false) {
    if (isLocalPreviewEnabled) {
      setCurrentUser(previewUser)
      setUserData(previewProfile)
      setIsSuperAdmin(true)
      return { user: previewUser }
    }

    requireFirebaseConfiguration()
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    const authGeneration = selectAuthenticatedUser(user)
    const isNewAuthUser = getAdditionalUserInfo(result)?.isNewUser === true
    let userSnapshot
    try {
      userSnapshot = await getDoc(doc(db, 'users', user.uid))
    } catch (profileReadError) {
      if (isCurrentIdentity(user.uid, authGeneration) && isNewAuthUser) {
        await rollbackFreshFirebaseUser(user)
        if (isCurrentIdentity(user.uid, authGeneration)) invalidateAuthenticatedUser()
      }
      throw profileReadError
    }
    if (!isCurrentIdentity(user.uid, authGeneration)) {
      throw new Error('Authentication changed before Google profile loading completed.')
    }
    if (!userSnapshot.exists() && isSignUp) {
      try {
        await setDoc(doc(db, 'users', user.uid), createInitialProfile(user))
      } catch (profileError) {
        if (!isCurrentIdentity(user.uid, authGeneration)) {
          throw new Error('Authentication changed before Google profile setup completed.', { cause: profileError })
        }
        if (isNewAuthUser) {
          const rollbackError = await rollbackFreshFirebaseUser(user)
          if (isCurrentIdentity(user.uid, authGeneration)) invalidateAuthenticatedUser()
          if (rollbackError) {
            throw new Error('Your Google identity was created, but profile setup failed and automatic cleanup was unsuccessful. Please contact support before retrying.', { cause: profileError })
          }
        } else {
          invalidateAuthenticatedUser()
          await signOut(auth)
        }
        throw new Error('Google profile setup failed. Please try again.', { cause: profileError })
      }
      const profile = await loadUserData(user, authGeneration)
      if (profile === STALE_PROFILE_LOAD) throw new Error('Authentication changed before Google profile loading completed.')
    } else if (userSnapshot.exists()) {
      const profile = await loadUserData(user, authGeneration)
      if (profile === STALE_PROFILE_LOAD) throw new Error('Authentication changed before Google profile loading completed.')
    } else {
      if (isNewAuthUser) {
        await rollbackFreshFirebaseUser(user)
        if (isCurrentIdentity(user.uid, authGeneration)) invalidateAuthenticatedUser()
      } else {
        invalidateAuthenticatedUser()
        await signOut(auth)
      }
      throw new Error('User account is not set up. Choose Sign up first.')
    }
    return result
  }

  /**
   * Returns whether the current Firestore trial or subscription is active.
   */
  function hasActiveAccess() {
    return profileHasActiveAccess(userData, isSuperAdmin)
  }

  /**
   * Sends Firebase's hosted password-recovery email for the existing account.
   */
  async function resetPassword(email) {
    if (isLocalPreviewEnabled) return
    requireFirebaseConfiguration()
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return
      throw error
    }
  }

  /**
   * Ends the Firebase session and clears all locally held profile state.
   */
  async function logout() {
    invalidateAuthenticatedUser()
    if (!isLocalPreviewEnabled) {
      requireFirebaseConfiguration()
      await signOut(auth)
    }
  }

  useEffect(() => {
    if (isLocalPreviewEnabled) {
      setCurrentUser(previewUser)
      setUserData(previewProfile)
      setIsSuperAdmin(true)
      setLoading(false)
      return undefined
    }

    if (!isFirebaseConfigured) {
      setLoading(false)
      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || null
      const authGeneration = selectAuthenticatedUser(user)
      try {
        if (user) {
          await loadUserData(user, authGeneration)
        }
      } catch (authError) {
        if (!isCurrentIdentity(uid, authGeneration)) return
        console.error('Firebase profile failed to load:', authError)
        setUserData(null)
        setIsSuperAdmin(false)
      } finally {
        if (isCurrentIdentity(uid, authGeneration)) setLoading(false)
      }
    }, (authError) => {
      console.error('Firebase authentication failed to initialize:', authError)
      invalidateAuthenticatedUser()
      setLoading(false)
    })
    return unsubscribe
    // Firebase configuration is static for the lifetime of the application.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(() => ({
    currentUser,
    userData,
    isSuperAdmin,
    provider,
    signup,
    login,
    signInWithGoogle,
    resetPassword,
    logout,
    hasActiveAccess,
    loading,
  }), [currentUser, userData, isSuperAdmin, loading, provider])

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>
}
