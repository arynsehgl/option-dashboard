/**
 * Verifies that the order ticket never leaks draft state and safely reuses one
 * idempotency identity for an ambiguous retry.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrderTicket from './OrderTicket'

const instrument = { instrumentKey: 'NSE:RELIANCE', exchange: 'NSE', symbol: 'RELIANCE', price: 2986.4 }

describe('OrderTicket safeguards', () => {
  it('disables all manual paper submissions', () => {
    render(<OrderTicket instrument={instrument} environment="paper" connected onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Review buy order' })).toBeDisabled()
    expect(screen.getByText(/Manual paper orders are disabled/)).toBeInTheDocument()
  })

  it('hides live order entry for the V2 release', () => {
    render(<OrderTicket instrument={instrument} environment="live" connected onSubmit={vi.fn()} />)
    expect(screen.getByText('Live execution locked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Review .* order/ })).not.toBeInTheDocument()
  })

  it('blocks an enabled future live ticket until Kite is connected', () => {
    render(<OrderTicket instrument={instrument} environment="live" connected={false} liveOrderingEnabled onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Review buy order' })).toBeDisabled()
    expect(screen.getByText(/Connect a valid Kite session/)).toBeInTheDocument()
  })

  it('keeps an ambiguous retry key stable, reports the error in the modal, and refreshes after success', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('Broker acknowledgement timed out.'))
      .mockResolvedValueOnce({ orderId: 'order-1' })
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<OrderTicket instrument={instrument} environment="live" connected liveOrderingEnabled onSubmit={onSubmit} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole('button', { name: 'Review buy order' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Broker acknowledgement timed out.')
    expect(screen.getByRole('dialog', { name: 'Review broker order' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[0][1]).toBe(onSubmit.mock.calls[1][1])
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Order acknowledged')
  })

  it('resets prices, review state, feedback, and retry identity for a new instrument', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('Ambiguous response.'))
      .mockResolvedValueOnce({ orderId: 'order-2' })
    const { rerender } = render(<OrderTicket instrument={instrument} environment="live" connected liveOrderingEnabled onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Order type'), { target: { value: 'LIMIT' } })
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review buy order' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ambiguous response.')
    const firstKey = onSubmit.mock.calls[0][1]

    const nextInstrument = { instrumentKey: 'NSE:TCS', exchange: 'NSE', symbol: 'TCS', price: 4123.5 }
    rerender(<OrderTicket instrument={nextInstrument} environment="live" connected liveOrderingEnabled onSubmit={onSubmit} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Ambiguous response.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Price')).toHaveValue(4123.5)

    fireEvent.click(screen.getByRole('button', { name: 'Review buy order' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][1]).not.toBe(firstKey)
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ instrumentKey: 'NSE:TCS', tradingsymbol: 'TCS', price: 4123.5 })
  })

  it('creates a new retry identity after a material draft change', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('Ambiguous response.'))
      .mockResolvedValueOnce({ orderId: 'order-3' })
    render(<OrderTicket instrument={instrument} environment="live" connected liveOrderingEnabled onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review buy order' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ambiguous response.')
    const firstKey = onSubmit.mock.calls[0][1]

    fireEvent.click(screen.getByRole('button', { name: 'Close review' }))
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review buy order' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm live/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][1]).not.toBe(firstKey)
    expect(onSubmit.mock.calls[1][0].quantity).toBe(2)
  })
})
