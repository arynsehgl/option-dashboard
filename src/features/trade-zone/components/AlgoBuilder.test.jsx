/**
 * Verifies that V2 strategies remain transparent, inactive drafts until
 * automated exit safeguards are available.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AlgoBuilder from './AlgoBuilder'

const instruments = [{ instrumentKey: 'NSE:RELIANCE', symbol: 'RELIANCE', exchange: 'NSE' }]

describe('Algo Builder execution guard', () => {
  it('keeps activation disabled and explains that exit inputs are preview-only', () => {
    render(<AlgoBuilder onSave={vi.fn()} instruments={instruments} />)
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Activation unavailable' })).toBeDisabled()
    expect(screen.getByText(/Stop-loss and target values do not trigger automated exits/)).toBeInTheDocument()
  })

  it('persists only an inactive paper draft', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'strategy-1', name: 'VWAP momentum confirmation' })
    render(<AlgoBuilder onSave={onSave} instruments={instruments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ environment: 'paper', activate: false })
    expect(screen.getByRole('status')).toHaveTextContent('inactive strategy draft')
  })

  it('labels stop and target values as planning references in the preview', () => {
    render(<AlgoBuilder onSave={vi.fn()} instruments={instruments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview logic' }))
    expect(screen.getByRole('status')).toHaveTextContent('planning references only')
  })
})
