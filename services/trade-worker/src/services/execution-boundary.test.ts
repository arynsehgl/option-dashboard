/**
 * Regression tests for the deployment-level live broker mutation boundary.
 * @module services/execution-boundary.test
 */

import { describe, expect, it } from 'vitest'
import { evaluateLiveExecutionGate } from './execution-boundary.js'

describe('live broker execution boundary', () => {
  it('keeps live ordering impossible while the deployment kill-switch is off', () => {
    expect(evaluateLiveExecutionGate(false, false)).toEqual({ allowed: false, status: 403, error: 'Live ordering is disabled at the worker level.' })
    expect(evaluateLiveExecutionGate(false, true)).toEqual({ allowed: false, status: 403, error: 'Live ordering is disabled at the worker level.' })
  })

  it('still requires a fresh human confirmation when live ordering is enabled', () => {
    expect(evaluateLiveExecutionGate(true, false)).toMatchObject({ allowed: false, status: 400 })
    expect(evaluateLiveExecutionGate(true, true)).toEqual({ allowed: true, status: 200 })
  })
})
