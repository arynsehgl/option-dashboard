/**
 * Regression tests for authenticated encryption and signed callback state.
 * @module lib/crypto.test
 */

import { describe, expect, it } from 'vitest'
import { createSignedState, decryptSecret, encryptSecret, verifySignedState } from './crypto.js'

const key = Buffer.alloc(32, 7).toString('base64')

describe('credential cryptography', () => {
  it('round-trips authenticated encryption without retaining plaintext', () => {
    const encrypted = encryptSecret('sensitive-value', key)
    expect(encrypted).not.toContain('sensitive-value')
    expect(decryptSecret(encrypted, key)).toBe('sensitive-value')
  })

  it('binds broker login state to the signed user', () => {
    const state = createSignedState('user-123', key)
    expect(verifySignedState(state, key)).toBe('user-123')
    expect(() => verifySignedState(`${state}tampered`, key)).toThrow()
  })

  it('does not accept a stream ticket as broker callback state', () => {
    const ticket = createSignedState('user-123', key, 60, 'market-stream')
    expect(verifySignedState(ticket, key, 'market-stream')).toBe('user-123')
    expect(() => verifySignedState(ticket, key)).toThrow('invalid purpose')
  })
})
