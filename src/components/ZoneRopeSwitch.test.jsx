/** Verifies Zone Rope navigation semantics for both application zones. */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ZoneRopeSwitch from './ZoneRopeSwitch'

/**
 * Renders the rope inside a minimal route graph for navigation assertions.
 */
function renderRope(currentZone) {
  return render(
    <MemoryRouter initialEntries={[currentZone === 'dashboard' ? '/dashboard' : '/trade-zone']}>
      <Routes>
        <Route path="/dashboard" element={<><ZoneRopeSwitch currentZone="dashboard" /><div>Dashboard zone</div></>} />
        <Route path="/trade-zone" element={<><ZoneRopeSwitch currentZone="trade-zone" /><div>Trade Zone workspace</div></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ZoneRopeSwitch', () => {
  afterEach(() => vi.useRealTimers())

  it('switches from Dashboard to Trade Zone after the pull animation', async () => {
    vi.useFakeTimers()
    renderRope('dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Trade Zone' }))
    await act(async () => { vi.advanceTimersByTime(260) })
    expect(screen.getByText('Trade Zone workspace')).toBeInTheDocument()
  })

  it('switches from Trade Zone back to Dashboard', async () => {
    vi.useFakeTimers()
    renderRope('trade-zone')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Dashboard' }))
    await act(async () => { vi.advanceTimersByTime(260) })
    expect(screen.getByText('Dashboard zone')).toBeInTheDocument()
  })
})
