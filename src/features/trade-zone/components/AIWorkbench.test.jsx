/** Verifies the AI workbench blocks research without a live market feed. */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AIWorkbench from './AIWorkbench'

const report = { date: '2026-09-09', confidence: 0, thesis: 'No trade.', plannedTrades: 0, acceptedTrades: 0, rejectedTrades: 0, realisedPnl: 0, fees: 0, lessons: [] }

describe('AI Workbench live-data guard', () => {
  it('blocks a real research run until the Kite feed is healthy', () => {
    render(<AIWorkbench report={report} onRun={vi.fn()} preview={false} connected={false} feedLive={false} />)
    expect(screen.getByRole('button', { name: 'Live data required' })).toBeDisabled()
    expect(screen.getByText('WAITING FOR LIVE DATA')).toBeInTheDocument()
  })
})
