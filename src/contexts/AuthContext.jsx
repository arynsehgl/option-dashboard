import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider, SUPERADMIN_EMAIL } from '../config/firebase'

const AuthContext = createContext()

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Sign up with email and password
  async function signup(email, password, name, phone) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Update profile with display name
      if (name) {
        await updateProfile(user, { displayName: name })
      }

      // Create user document in Firestore
      const trialEndDate = new Date()
      trialEndDate.setDate(trialEndDate.getDate() + 3) // 3-day trial

      const userData = {
        uid: user.uid,
        email: user.email,
        name: name || user.displayName || '',
        phone: phone || '',
        trialStartDate: serverTimestamp(),
        trialEndDate: trialEndDate.toISOString(),
        isTrialActive: true,
        subscriptionStatus: 'trial',
        subscriptionPlan: null,
        subscriptionEndDate: null,
        createdAt: serverTimestamp(),
        isSuperAdmin: user.email === SUPERADMIN_EMAIL
      }

      await setDoc(doc(db, 'users', user.uid), userData)
      setUserData(userData)
      setIsSuperAdmin(user.email === SUPERADMIN_EMAIL)

      return userCredential
    } catch (error) {
      throw error
    }
  }

  // Sign in with email and password
  async function login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      await loadUserData(userCredential.user.uid)
      return userCredential
    } catch (error) {
      throw error
    }
  }

  // Sign in with Google
  async function signInWithGoogle(isSignUp = false) {
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user

      // Check if user document exists
      const userDoc = await getDoc(doc(db, 'users', user.uid))

      if (!userDoc.exists() && isSignUp) {
        // New user - create document with trial
        const trialEndDate = new Date()
        trialEndDate.setDate(trialEndDate.getDate() + 3)

        const userData = {
          uid: user.uid,
          email: user.email,
          name: user.displayName || '',
          phone: '',
          trialStartDate: serverTimestamp(),
          trialEndDate: trialEndDate.toISOString(),
          isTrialActive: true,
          subscriptionStatus: 'trial',
          subscriptionPlan: null,
          subscriptionEndDate: null,
          createdAt: serverTimestamp(),
          isSuperAdmin: user.email === SUPERADMIN_EMAIL
        }

        await setDoc(doc(db, 'users', user.uid), userData)
        setUserData(userData)
      } else if (userDoc.exists()) {
        // Existing user - load data
        await loadUserData(user.uid)
      } else {
        // User exists in auth but not in Firestore (edge case)
        throw new Error('User account not properly set up. Please contact support.')
      }

      setIsSuperAdmin(user.email === SUPERADMIN_EMAIL)
      return result
    } catch (error) {
      throw error
    }
  }

  // Load user data from Firestore
  async function loadUserData(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))
      if (userDoc.exists()) {
        const data = userDoc.data()
        setUserData(data)
        setIsSuperAdmin(data.isSuperAdmin || data.email === SUPERADMIN_EMAIL)
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  // Check if user has active subscription or trial
  function hasActiveAccess() {
    if (isSuperAdmin) return true
    if (!userData) return false

    // Check if trial is active
    if (userData.isTrialActive) {
      const trialEndDate = new Date(userData.trialEndDate)
      const now = new Date()
      if (now < trialEndDate) {
        return true
      } else {
        // Trial expired - update status
        updateTrialStatus(false)
        return false
      }
    }

    // Check if subscription is active
    if (userData.subscriptionStatus === 'active' && userData.subscriptionEndDate) {
      const subEndDate = new Date(userData.subscriptionEndDate)
      const now = new Date()
      return now < subEndDate
    }

    return false
  }

  // Update trial status
  async function updateTrialStatus(isActive) {
    if (!currentUser) return
    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        { isTrialActive: isActive },
        { merge: true }
      )
      setUserData(prev => ({ ...prev, isTrialActive: isActive }))
    } catch (error) {
      console.error('Error updating trial status:', error)
    }
  }

  // Logout
  async function logout() {
    try {
      await signOut(auth)
      setUserData(null)
      setIsSuperAdmin(false)
    } catch (error) {
      throw error
    }
  }

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        await loadUserData(user.uid)
      } else {
        setUserData(null)
        setIsSuperAdmin(false)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value = {
    currentUser,
    userData,
    isSuperAdmin,
    signup,
    login,
    signInWithGoogle,
    logout,
    hasActiveAccess,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
