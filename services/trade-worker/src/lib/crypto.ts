/** Encrypts worker secrets and signs short-lived, purpose-bound state tokens. */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Decodes and validates the base64-encoded 256-bit application encryption key.
 */
function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

/**
 * Encrypts a secret using AES-256-GCM with a unique nonce.
 */
export function encryptSecret(plaintext: string, encodedKey: string) {
  const key = decodeKey(encodedKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map((value) => value.toString('base64url')).join('.')
}

/**
 * Decrypts an AES-256-GCM secret and verifies its authentication tag.
 */
export function decryptSecret(payload: string, encodedKey: string) {
  const [ivPart, tagPart, cipherPart] = payload.split('.')
  if (!ivPart || !tagPart || !cipherPart) throw new Error('Encrypted secret has an invalid format')
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(encodedKey), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(cipherPart, 'base64url')), decipher.final()]).toString('utf8')
}

/**
 * Creates a short-lived signed state token for the broker login redirect.
 */
export function createSignedState(userId: string, encodedKey: string, lifetimeSeconds = 600, purpose = 'kite-login') {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    purpose,
    nonce: randomBytes(16).toString('base64url'),
  })).toString('base64url')
  const signature = createHmac('sha256', decodeKey(encodedKey)).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

/**
 * Verifies a broker login state token and returns its bound user id.
 */
export function verifySignedState(state: string, encodedKey: string, expectedPurpose = 'kite-login') {
  const [payload, providedSignature] = state.split('.')
  if (!payload || !providedSignature) throw new Error('Missing broker login state')
  const expectedSignature = createHmac('sha256', decodeKey(encodedKey)).update(payload).digest()
  const provided = Buffer.from(providedSignature, 'base64url')
  if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) throw new Error('Invalid broker login state')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId: string; expiresAt: number; purpose?: string }
  if (parsed.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('Expired broker login state')
  if (parsed.purpose !== expectedPurpose) throw new Error('Signed state has an invalid purpose')
  return parsed.userId
}
