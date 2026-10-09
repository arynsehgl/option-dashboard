/**
 * Regression tests for cached, single-flight dependency readiness checks.
 * @module lib/readiness.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadinessCache } from './readiness.js'

afterEach(() => {
  vi.useRealTimers()
})

/** Creates a controllable promise for single-flight assertions. */
function deferred() {
  let resolve: (() => void) | undefined
  let reject: ((error: unknown) => void) | undefined
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('dependency readiness cache', () => {
  it('coalesces concurrent calls, caches success, and refreshes after expiry', async () => {
    let currentTime = 1_000
    const firstProbe = deferred()
    const probe = vi.fn().mockReturnValueOnce(firstProbe.promise).mockResolvedValue(undefined)
    const readiness = createReadinessCache(probe, { successTtlMs: 30_000, now: () => currentTime })

    const first = readiness.check()
    const second = readiness.check()
    expect(probe).toHaveBeenCalledOnce()
    firstProbe.resolve?.()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])

    await readiness.check()
    expect(probe).toHaveBeenCalledOnce()
    currentTime += 30_001
    await readiness.check()
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('bypasses cached success and failure when startup forces a fresh probe', async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('dependency unavailable'))
      .mockResolvedValueOnce(undefined)
    const readiness = createReadinessCache(probe)

    await readiness.check()
    await expect(readiness.check({ force: true })).rejects.toThrow('dependency unavailable')
    await expect(readiness.check()).rejects.toThrow('Dependency readiness is temporarily unavailable')
    await expect(readiness.check({ force: true })).resolves.toBeUndefined()
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('serves a sanitized negative cache and retries after its short TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00.000Z'))
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error('upstream secret-bearing failure'))
      .mockResolvedValueOnce(undefined)
    const readiness = createReadinessCache(probe, { successTtlMs: 30_000, failureTtlMs: 5_000 })

    await expect(readiness.check()).rejects.toThrow('upstream secret-bearing failure')
    await expect(readiness.check()).rejects.toThrow('Dependency readiness is temporarily unavailable')
    expect(probe).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(5_001)
    await expect(readiness.check()).resolves.toBeUndefined()
    expect(probe).toHaveBeenCalledTimes(2)
  })
})
