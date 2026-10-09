/**
 * Creates the server-only Firebase Admin identity boundary used to validate V1
 * sessions and read authoritative Firestore subscription profiles.
 * @module lib/firebase
 */

import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export interface FirebaseAdminConfig {
  projectId: string
  clientEmail?: string
  privateKey?: string
  allowApplicationDefault?: boolean
  appName?: string
}

export interface VerifiedFirebaseToken {
  uid: string
  email?: string
  emailVerified: boolean
}

export interface FirebaseIdentitySource {
  verifyIdToken(idToken: string, checkRevoked: boolean): Promise<VerifiedFirebaseToken>
  getUserIdentity(firebaseUid: string): Promise<VerifiedFirebaseToken>
  getUserProfile(firebaseUid: string): Promise<Record<string, unknown> | null>
  checkReadiness(): Promise<void>
}

/**
 * Rejects a disabled Firebase account before its cached entitlement is used.
 */
export function assertFirebaseAccountEnabled(disabled: boolean) {
  if (disabled) throw new Error('Firebase account is disabled.')
}

/**
 * Reads a Firebase error code without coupling readiness logic to SDK classes.
 */
function getFirebaseErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
}

/**
 * Verifies Firebase Auth and Firestore Admin access. A missing sentinel Auth
 * user proves the read reached Firebase and is therefore an expected result.
 */
export async function assertFirebaseAdminReady(
  authProbe: () => Promise<unknown>,
  firestoreProbe: () => Promise<unknown>,
) {
  try {
    await authProbe()
  } catch (error) {
    if (getFirebaseErrorCode(error) !== 'auth/user-not-found') {
      throw new Error('Firebase Auth readiness check failed.', { cause: error })
    }
  }
  try {
    await firestoreProbe()
  } catch (error) {
    throw new Error('Firestore readiness check failed.', { cause: error })
  }
}

/**
 * Returns one named Admin app so hot reloads never initialize duplicate clients.
 */
function getOrCreateFirebaseApp(config: FirebaseAdminConfig): App {
  const appName = config.appName || 'stride-trade-worker'
  if (Boolean(config.clientEmail) !== Boolean(config.privateKey)) {
    throw new Error('Firebase Admin requires both clientEmail and privateKey when explicit credentials are used.')
  }
  if (!config.clientEmail && !config.allowApplicationDefault) {
    throw new Error('Firebase Application Default Credentials were not explicitly enabled.')
  }
  const existing = getApps().find((app) => app.name === appName)
  if (existing) return existing
  const credential = config.clientEmail && config.privateKey
    ? cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey.replaceAll('\\n', '\n'),
      })
    : applicationDefault()
  return initializeApp({ credential, projectId: config.projectId }, appName)
}

/**
 * Builds a narrow identity adapter rather than exposing privileged Admin clients
 * throughout the worker.
 */
export function createFirebaseIdentitySource(config: FirebaseAdminConfig): FirebaseIdentitySource {
  const app = getOrCreateFirebaseApp(config)
  const firebaseAuth = getAuth(app)
  const firestore = getFirestore(app)
  return {
    async verifyIdToken(idToken, checkRevoked) {
      const decoded = await firebaseAuth.verifyIdToken(idToken, checkRevoked)
      return {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
        emailVerified: decoded.email_verified === true,
      }
    },
    async getUserIdentity(firebaseUid) {
      const user = await firebaseAuth.getUser(firebaseUid)
      assertFirebaseAccountEnabled(user.disabled)
      return {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
      }
    },
    async getUserProfile(firebaseUid) {
      const snapshot = await firestore.collection('users').doc(firebaseUid).get()
      return snapshot.exists ? (snapshot.data() || null) : null
    },
    async checkReadiness() {
      await assertFirebaseAdminReady(
        () => firebaseAuth.getUser('__stride_worker_readiness_probe__'),
        () => firestore.collection('_stride_system').doc('readiness').get(),
      )
    },
  }
}
