/** Verifies truthful pricing-page trial status for legacy Firebase profiles. */
import { describe, expect, it } from 'vitest'
import { getActiveTrialDaysRemaining } from './PricingPage'

describe('PricingPage trial banner', () => {
  it('does not treat a stale V1 trial flag as active after its end date', () => {
    const now = Date.parse('2026-10-09T12:00:00.000Z')
    expect(getActiveTrialDaysRemaining({
      isTrialActive: true,
      trialEndDate: '2026-10-09T11:59:59.000Z',
      subscriptionStatus: 'active',
      subscriptionEndDate: '2027-10-09T12:00:00.000Z',
    }, now)).toBe(0)
    expect(getActiveTrialDaysRemaining({
      isTrialActive: true,
      trialEndDate: '2026-10-10T12:00:00.000Z',
    }, now)).toBe(1)
  })
})
