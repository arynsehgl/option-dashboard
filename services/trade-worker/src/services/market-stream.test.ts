/**
 * Regression tests for market-stream single-flight and upgrade lifecycle safety.
 * @module services/market-stream.test
 */

import type { Server } from 'node:http'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import {
  applyInitialMarketSubscription,
  attachMarketStreamServer,
  createSingleFlightLoader,
  createStreamSessionExpiry,
  markHubBrokerReconnecting,
  MARKET_STREAM_SESSION_TTL_MS,
  MAX_STREAM_BUFFERED_BYTES,
  MAX_STREAM_INSTRUMENT_TOKENS,
  parseMarketSubscription,
  reconcileConnectedHub,
  reconcileHub,
  sendStreamEvent,
} from './market-stream.js'
import { WebSocket } from 'ws'

afterEach(() => {
  vi.useRealTimers()
})

describe('market stream lifecycle', () => {
  it('coalesces concurrent hub creation and permits retry after rejection', async () => {
    const resources = new Map<string, { id: number }>()
    let releaseCreation: (() => void) | undefined
    const creationGate = new Promise<void>((resolve) => { releaseCreation = resolve })
    const createValue = vi.fn(async (key: string) => {
      await creationGate
      const resource = { id: 1 }
      resources.set(key, resource)
      return resource
    })
    const load = createSingleFlightLoader((key: string) => resources.get(key), createValue)
    const first = load('user-1')
    const second = load('user-1')
    expect(createValue).toHaveBeenCalledTimes(1)
    releaseCreation?.()
    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 1 }, { id: 1 }])

    const retryCreate = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ id: 2 })
    const retryLoad = createSingleFlightLoader<string, { id: number }>(() => undefined, retryCreate)
    await expect(retryLoad('user-2')).rejects.toThrow('temporary failure')
    await expect(retryLoad('user-2')).resolves.toEqual({ id: 2 })
    expect(retryCreate).toHaveBeenCalledTimes(2)
  })

  it('explicitly closes upgrade requests for unknown paths', () => {
    let upgradeHandler: ((request: { url?: string; headers: Record<string, string> }, socket: { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }, head: Buffer) => void) | undefined
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') upgradeHandler = handler
        return server
      }),
    } as unknown as Server
    const logger = { error: vi.fn(), warn: vi.fn() } as unknown as Logger
    attachMarketStreamServer(server, {} as SupabaseAdmin, {
      PUBLIC_WORKER_URL: 'https://worker.example.com',
    } as WorkerConfig, logger)
    const socket = { write: vi.fn(), destroy: vi.fn() }
    upgradeHandler?.({ url: '/not-a-stream', headers: {} }, socket, Buffer.alloc(0))
    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    expect(socket.destroy).toHaveBeenCalledOnce()
  })

  it('expires browser authorization after five minutes and supports safe cleanup', () => {
    vi.useFakeTimers()
    const expireSession = vi.fn()
    createStreamSessionExpiry(expireSession)

    vi.advanceTimersByTime(MARKET_STREAM_SESSION_TTL_MS - 1)
    expect(expireSession).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(expireSession).toHaveBeenCalledOnce()

    const cancelledExpiry = vi.fn()
    const lease = createStreamSessionExpiry(cancelledExpiry)
    lease.clear()
    vi.advanceTimersByTime(MARKET_STREAM_SESSION_TTL_MS)
    expect(cancelledExpiry).not.toHaveBeenCalled()
  })

  it('rejects subscriptions above the shared 100-token boundary', () => {
    expect(() => parseMarketSubscription(JSON.stringify({
      type: 'subscribe',
      instrumentTokens: Array.from({ length: MAX_STREAM_INSTRUMENT_TOKENS + 1 }, (_, index) => index + 1),
      mode: 'quote',
    }))).toThrow()
  })

  it('defers bookkeeping before connect and resubscribes every desired token on reconnect', () => {
    let connected = false
    const ticker = {
      connected: vi.fn(() => connected),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      setMode: vi.fn(),
    }
    const hub = {
      clients: new Set([{ instrumentTokens: new Set([101, 202]), mode: 'quote' }]),
      subscribedTokens: new Set<number>(),
      ticker,
    }

    reconcileHub(hub as never)
    expect(hub.subscribedTokens.size).toBe(0)
    expect(ticker.subscribe).not.toHaveBeenCalled()

    connected = true
    reconcileConnectedHub(hub as never)
    expect(ticker.subscribe).toHaveBeenLastCalledWith([101, 202])
    expect(hub.subscribedTokens).toEqual(new Set([101, 202]))

    ticker.subscribe.mockClear()
    reconcileConnectedHub(hub as never)
    expect(ticker.subscribe).toHaveBeenCalledWith([101, 202])
  })

  it('marks every browser reconnecting and clears broker-side state on transport loss', () => {
    const send = vi.fn()
    const hub = {
      clients: new Set([{ socket: { readyState: WebSocket.OPEN, bufferedAmount: 0, send, close: vi.fn() } }]),
      subscribedTokens: new Set([101, 202]),
    }

    markHubBrokerReconnecting(hub as never)

    expect(hub.subscribedTokens.size).toBe(0)
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'status', status: 'reconnecting' }))
  })

  it('closes a slow browser instead of growing its outbound quote backlog', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: MAX_STREAM_BUFFERED_BYTES,
      send: vi.fn(),
      close: vi.fn(),
    }

    expect(sendStreamEvent(socket as never, { type: 'ticks', data: [{ instrument_token: 101 }] })).toBe(false)
    expect(socket.send).not.toHaveBeenCalled()
    expect(socket.close).toHaveBeenCalledWith(1013, 'Market stream consumer is too slow')
  })

  it('accepts exactly one bounded subscription per browser socket', () => {
    const ticker = {
      connected: vi.fn(() => false),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      setMode: vi.fn(),
    }
    const client = {
      instrumentTokens: new Set<number>(),
      mode: 'quote',
      subscriptionAccepted: false,
    }
    const hub = { clients: new Set([client]), subscribedTokens: new Set<number>(), ticker }
    const subscription = JSON.stringify({ type: 'subscribe', instrumentTokens: [101], mode: 'quote' })

    expect(applyInitialMarketSubscription(client as never, hub as never, subscription).instrumentTokens).toEqual([101])
    expect(client.subscriptionAccepted).toBe(true)
    expect(() => applyInitialMarketSubscription(client as never, hub as never, subscription)).toThrow('already set')
  })
})
