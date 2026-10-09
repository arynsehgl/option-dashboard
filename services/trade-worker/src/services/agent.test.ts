/**
 * Regression tests for plan-only research and serialized agent tool execution.
 * @module services/agent.test
 */

import { describe, expect, it } from 'vitest'
import { canExecutePaperIntent, createSerialExecutor } from './agent.js'

describe('agent paper execution boundary', () => {
  it('keeps morning research plan-only and permits only in-session revalidation', () => {
    const marketOpen = new Date('2026-01-05T04:00:00.000Z')
    expect(canExecutePaperIntent('morning_research', marketOpen)).toBe(false)
    expect(canExecutePaperIntent('open_revalidation', marketOpen)).toBe(true)
    expect(canExecutePaperIntent('open_revalidation', new Date('2026-01-05T09:50:00.000Z'))).toBe(false)
  })

  it('serializes concurrent custom-tool work and continues after a failure', async () => {
    const executeSerially = createSerialExecutor()
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const first = executeSerially(async () => {
      events.push('first-start')
      await firstGate
      events.push('first-end')
      throw new Error('expected failure')
    })
    const second = executeSerially(async () => {
      events.push('second')
      return 'complete'
    })
    await Promise.resolve()
    expect(events).toEqual(['first-start'])
    releaseFirst?.()
    await expect(first).rejects.toThrow('expected failure')
    await expect(second).resolves.toBe('complete')
    expect(events).toEqual(['first-start', 'first-end', 'second'])
  })
})
