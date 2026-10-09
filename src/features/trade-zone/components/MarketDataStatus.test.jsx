/** Verifies market-data labels and actions accurately reflect feed state. */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarketDataStatus from './MarketDataStatus'

const callbacks = { onConnect: vi.fn(), onOpenDemo: vi.fn(), onExitDemo: vi.fn() }

describe('MarketDataStatus truth labels', () => {
  it('does not describe an unconfigured worker as live data', () => {
    render(<MarketDataStatus workerConfigured={false} demo={false} connected={false} feedHealth={{ state: 'disconnected', label: 'Kite login required' }} lastTickAt={null} {...callbacks} />)
    expect(screen.getByText('Live market service is not configured')).toBeInTheDocument()
    expect(screen.getByText(/empty ₹10 lakh virtual account/)).toBeInTheDocument()
  })

  it('states that a healthy Kite feed is data-only for Playground', () => {
    render(<MarketDataStatus workerConfigured demo={false} connected feedHealth={{ state: 'live', label: 'Live market data' }} lastTickAt="2026-09-09T04:01:00.000Z" {...callbacks} />)
    expect(screen.getByText('Live market data')).toBeInTheDocument()
    expect(screen.getByText(/cannot reach Zerodha orders/)).toBeInTheDocument()
  })
})
