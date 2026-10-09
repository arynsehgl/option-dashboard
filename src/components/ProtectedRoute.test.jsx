/** Verifies entitlement routing for the authenticated Options and Trade Zone workspace. */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'

const authState = vi.hoisted(() => ({
  currentUser: { uid: 'firebase-user' },
  isSuperAdmin: false,
  loading: false,
  profile: null,
}))

vi.mock('../contexts/AuthContext', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useAuth: () => ({
      currentUser: authState.currentUser,
      isSuperAdmin: authState.isSuperAdmin,
      loading: authState.loading,
      hasActiveAccess: () => original.profileHasActiveAccess(authState.profile, authState.isSuperAdmin, Date.parse('2026-10-09T12:00:00.000Z')),
    }),
  }
})

describe('ProtectedRoute entitlement routing', () => {
  beforeEach(() => {
    authState.currentUser = { uid: 'firebase-user' }
    authState.isSuperAdmin = false
    authState.loading = false
    authState.profile = null
  })

  it.each([
    ['an active trial', {
      isTrialActive: true,
      trialEndDate: '2026-10-10T12:00:00.000Z',
      subscriptionStatus: 'trial',
    }, false],
    ['the configured administrator', {
      isTrialActive: false,
      trialEndDate: '2026-10-08T12:00:00.000Z',
      subscriptionStatus: 'expired',
    }, true],
  ])('allows %s to enter the workspace', (_label, profile, isSuperAdmin) => {
    authState.profile = profile
    authState.isSuperAdmin = isSuperAdmin
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Options workspace</div></ProtectedRoute>} />
          <Route path="/pricing" element={<div>Pricing page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Options workspace')).toBeInTheDocument()
  })

  it('redirects an expired non-administrator to Pricing', () => {
    authState.profile = {
      isTrialActive: true,
      trialEndDate: '2026-10-08T12:00:00.000Z',
      subscriptionStatus: 'expired',
    }
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Options workspace</div></ProtectedRoute>} />
          <Route path="/pricing" element={<div>Pricing page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Pricing page')).toBeInTheDocument()
  })
})
