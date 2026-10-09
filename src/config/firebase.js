/** Initializes the browser Firebase services shared with the V1 production app. */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase compatibility client for deployments that have legacy Firebase
 * credentials. Missing credentials intentionally leave the client disabled so
 * local preview and unconfigured production builds fail safely.
 * @module config/firebase
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.appId
)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const googleProvider = app ? new GoogleAuthProvider() : null

/** Conservative email shape required for configured administrator entries. */
const CONFIGURED_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Converts comma-separated configuration values into a unique normalized
 * administrator email allowlist. Empty, non-string, and malformed entries are
 * ignored so invalid configuration fails closed.
 *
 * @param {...(string|string[]|null|undefined)} sources Configuration values.
 * @returns {string[]} Normalized administrator email addresses.
 */
export function normalizeSuperAdminEmails(...sources) {
  return [...new Set(
    sources
      .flatMap((source) => (Array.isArray(source) ? source : [source]))
      .filter((source) => typeof source === 'string')
      .flatMap((source) => source.split(','))
      .map((email) => email.trim().toLowerCase())
      .filter((email) => CONFIGURED_EMAIL_PATTERN.test(email)),
  )]
}

/**
 * Resolves the plural administrator setting with a legacy fallback only when
 * the plural value is absent or whitespace-only. A present but invalid plural
 * value returns an empty list instead of silently restoring a stale owner.
 *
 * @param {string|null|undefined} pluralValue Comma-separated administrator list.
 * @param {string|null|undefined} legacyValue Legacy single administrator email.
 * @returns {string[]} The authoritative normalized administrator allowlist.
 */
export function resolveSuperAdminEmails(pluralValue, legacyValue) {
  const hasPluralSetting = typeof pluralValue === 'string' && pluralValue.trim() !== ''
  return normalizeSuperAdminEmails(hasPluralSetting ? pluralValue : legacyValue)
}

/** Authoritative normalized administrator allowlist for the browser client. */
export const SUPERADMIN_EMAILS = Object.freeze(resolveSuperAdminEmails(
  import.meta.env.VITE_SUPERADMIN_EMAILS,
  import.meta.env.VITE_SUPERADMIN_EMAIL,
))

/** Legacy first-address export retained for compatibility with existing imports. */
export const SUPERADMIN_EMAIL = SUPERADMIN_EMAILS[0] || ''

export default app
