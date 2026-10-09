/**
 * Verifies that live-order requests require and forward a caller-owned
 * idempotency key instead of silently creating a different key per retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('tradeApi live-order boundary', () => {
  let getIdToken

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_TRADE_WORKER_URL', 'https://worker.example.test')
    getIdToken = vi.fn().mockResolvedValue('firebase-id-token')
    vi.doMock('../../config/firebase', () => ({
      auth: { currentUser: { getIdToken } },
      isFirebaseConfigured: true,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { orderId: 'order-1' } }),
    }))
  })

  afterEach(() => {
    vi.doUnmock('../../config/firebase')
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects a live order without a stable key', async () => {
    const { submitLiveOrder } = await import('./tradeApi')
    await expect(submitLiveOrder({ instrumentKey: 'NSE:RELIANCE' })).rejects.toThrow('stable idempotency key')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards the exact key supplied by the reviewed ticket', async () => {
    const { submitLiveOrder } = await import('./tradeApi')
    await submitLiveOrder({ instrumentKey: 'NSE:RELIANCE' }, 'draft-retry-key')
    expect(fetch).toHaveBeenCalledWith('https://worker.example.test/api/v1/live/orders', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Idempotency-Key': 'draft-retry-key',
        'X-User-Confirmed': 'true',
      }),
    }))
  })

  it('refreshes an expired Firebase token once without changing the retry key', async () => {
    fetch
      .mockResolvedValueOnce({ status: 401, ok: false, json: vi.fn().mockResolvedValue({ error: 'expired' }) })
      .mockResolvedValueOnce({ status: 202, ok: true, json: vi.fn().mockResolvedValue({ data: { orderId: 'order-2' } }) })
    getIdToken.mockResolvedValueOnce('expired-token').mockResolvedValueOnce('refreshed-token')
    const { submitLiveOrder } = await import('./tradeApi')
    await submitLiveOrder({ instrumentKey: 'NSE:RELIANCE' }, 'stable-key')
    expect(getIdToken).toHaveBeenNthCalledWith(1, false)
    expect(getIdToken).toHaveBeenNthCalledWith(2, true)
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-key')
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe('stable-key')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-token')
  })

  it('does not report broker connectivity from the browser socket open event', async () => {
    const listeners = new Map()
    const socket = {
      addEventListener: vi.fn((event, listener) => listeners.set(event, listener)),
      send: vi.fn(),
    }
    vi.stubGlobal('WebSocket', vi.fn(function WebSocketMock() { return socket }))
    fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { ticket: 'short-lived-ticket' } }),
    })
    const statuses = []
    const { openMarketStream } = await import('./tradeApi')
    await openMarketStream([123], vi.fn(), (status) => statuses.push(status))

    listeners.get('open')?.()
    expect(statuses).toEqual(['connecting'])
    expect(statuses).not.toContain('connected')
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', instrumentTokens: [123], mode: 'quote' }))

    listeners.get('message')?.({ data: JSON.stringify({ type: 'status', status: 'connected' }) })
    expect(statuses).toEqual(['connecting', 'connected'])

    listeners.get('message')?.({ data: JSON.stringify({ type: 'error', code: 'INVALID_SUBSCRIPTION' }) })
    expect(statuses).toEqual(['connecting', 'connected', 'error'])
  })
})
