/**
 * Exercises Trade Zone request isolation and bounded market-stream recovery
 * without depending on chart rendering or a live Trade Worker.
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TradeZone from './TradeZone'
import {
  getInstrumentCandles,
  getTradeOverview,
  isTradeWorkerConfigured,
  openMarketStream,
} from '../features/trade-zone/tradeApi'

vi.mock('../components/BrandMark', () => ({ default: () => 'Stride' }))
vi.mock('../components/ThemeToggle', () => ({ default: () => null }))
vi.mock('../components/ZoneRopeSwitch', () => ({ default: () => null }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { email: 'user@example.com' }, userData: { name: 'Test User' }, logout: vi.fn() }) }))
vi.mock('../features/trade-zone/components/AIWorkbench', () => ({ default: () => null }))
vi.mock('../features/trade-zone/components/AlgoBuilder', () => ({ default: () => null }))
vi.mock('../features/trade-zone/components/MarketChart', () => ({ default: () => null }))
vi.mock('../features/trade-zone/components/MarketDataStatus', () => ({ default: () => null }))
vi.mock('../features/trade-zone/components/OrderTicket', () => ({ default: ({ instrument, environment }) => `ticket:${environment}:${instrument.symbol}` }))
vi.mock('../features/trade-zone/components/KiteSetupDialog', () => ({ default: () => null }))
vi.mock('../features/trade-zone/components/Watchlist', () => ({ default: () => null }))
vi.mock('../features/trade-zone/tradeApi', () => ({
  addWatchlistInstrument: vi.fn(),
  getKiteLoginUrl: vi.fn(),
  getInstrumentCandles: vi.fn(),
  getTradeOverview: vi.fn(),
  isTradeWorkerConfigured: vi.fn(),
  openMarketStream: vi.fn(),
  saveKiteCredentials: vi.fn(),
  savePaperStrategy: vi.fn(),
  searchInstruments: vi.fn(),
  startAiResearchRun: vi.fn(),
  submitLiveOrder: vi.fn(),
}))

/**
 * Creates a controllable promise for out-of-order response tests.
 */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/**
 * Builds the minimal connected overview required by the workspace.
 */
function overview(environment, symbol, available) {
  return {
    environment,
    mode: environment,
    connection: { status: 'connected' },
    funds: { available, used: 0, opening: available, equity: available },
    pnl: { day: 0 },
    watchlist: [{ instrumentKey: `NSE:${symbol}`, instrumentToken: available, exchange: 'NSE', symbol, price: available }],
    holdings: [],
    orders: [],
    report: {},
    auditEvents: [],
  }
}

/**
 * Renders the overview route inside its router contract.
 */
function renderTradeZone() {
  return render(
    <MemoryRouter initialEntries={['/trade-zone']}>
      <Routes>
        <Route path="/trade-zone" element={<TradeZone />} />
        <Route path="/trade-zone/:section" element={<TradeZone />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TradeZone production state guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTradeWorkerConfigured.mockReturnValue(true)
    getInstrumentCandles.mockResolvedValue([])
    openMarketStream.mockResolvedValue({ close: vi.fn() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the previous environment and ignores its late refresh response', async () => {
    const stalePaperRefresh = deferred()
    const liveRequest = deferred()
    getTradeOverview
      .mockResolvedValueOnce(overview('paper', 'PAPER', 1111))
      .mockReturnValueOnce(stalePaperRefresh.promise)
      .mockReturnValueOnce(liveRequest.promise)
    renderTradeZone()

    expect(await screen.findByText('ticket:paper:PAPER')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle(/Market stream:/))
    await waitFor(() => expect(getTradeOverview).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Live view' }))
    expect(screen.queryByText('ticket:paper:PAPER')).not.toBeInTheDocument()
    expect(screen.getByText('Preparing Trade Zone…')).toBeInTheDocument()
    await waitFor(() => expect(getTradeOverview).toHaveBeenCalledTimes(3))

    await act(async () => liveRequest.resolve(overview('live', 'LIVE', 2222)))
    expect(await screen.findByText('ticket:live:LIVE')).toBeInTheDocument()
    await act(async () => stalePaperRefresh.resolve(overview('paper', 'STALE', 3333)))
    expect(screen.getByText('ticket:live:LIVE')).toBeInTheDocument()
    expect(screen.queryByText('ticket:paper:STALE')).not.toBeInTheDocument()
  })

  it('caps automatic stream retries and permits an explicit clean retry cycle', async () => {
    const statusCallbacks = []
    const sockets = []
    getTradeOverview.mockResolvedValue(overview('paper', 'RELIANCE', 1234))
    openMarketStream.mockImplementation((_tokens, _onEvent, onStatus) => {
      statusCallbacks.push(onStatus)
      const socket = { close: vi.fn() }
      sockets.push(socket)
      return Promise.resolve(socket)
    })
    renderTradeZone()
    expect(await screen.findByText('ticket:paper:RELIANCE')).toBeInTheDocument()
    await waitFor(() => expect(openMarketStream).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()

    act(() => statusCallbacks[0]('closed'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(2)

    act(() => statusCallbacks[1]('closed'))
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(3)

    act(() => statusCallbacks[2]('closed'))
    act(() => vi.advanceTimersByTime(30000))
    expect(openMarketStream).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button', { name: 'Reconnect feed' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect feed' }))
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(4)
    expect(sockets).toHaveLength(4)
  })

  it('resets the transient retry budget only after the worker reports broker connectivity', async () => {
    const statusCallbacks = []
    getTradeOverview.mockResolvedValue(overview('paper', 'RELIANCE', 1234))
    openMarketStream.mockImplementation((_tokens, _onEvent, onStatus) => {
      statusCallbacks.push(onStatus)
      return Promise.resolve({ close: vi.fn() })
    })
    renderTradeZone()
    expect(await screen.findByText('ticket:paper:RELIANCE')).toBeInTheDocument()
    await waitFor(() => expect(openMarketStream).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()

    act(() => statusCallbacks[0]('closed'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(2)

    act(() => statusCallbacks[1]('connected'))
    act(() => statusCallbacks[1]('closed'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(3)

    act(() => statusCallbacks[2]('closed'))
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(4)
  })

  it('closes a broker-failed socket before opening its replacement', async () => {
    const statusCallbacks = []
    const sockets = []
    getTradeOverview.mockResolvedValue(overview('paper', 'RELIANCE', 1234))
    openMarketStream.mockImplementation((_tokens, _onEvent, onStatus) => {
      statusCallbacks.push(onStatus)
      const socket = { close: vi.fn() }
      sockets.push(socket)
      return Promise.resolve(socket)
    })
    renderTradeZone()
    expect(await screen.findByText('ticket:paper:RELIANCE')).toBeInTheDocument()
    await waitFor(() => expect(openMarketStream).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()

    act(() => statusCallbacks[0]('error'))
    expect(sockets[0].close).toHaveBeenCalledOnce()
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(openMarketStream).toHaveBeenCalledTimes(2)
  })

  it('never treats a broker-disconnected heartbeat as a live signal', async () => {
    let eventCallback
    let statusCallback
    getTradeOverview.mockResolvedValue(overview('paper', 'RELIANCE', 1234))
    openMarketStream.mockImplementation((_tokens, onEvent, onStatus) => {
      eventCallback = onEvent
      statusCallback = onStatus
      return Promise.resolve({ close: vi.fn() })
    })
    renderTradeZone()
    expect(await screen.findByText('ticket:paper:RELIANCE')).toBeInTheDocument()
    await waitFor(() => expect(openMarketStream).toHaveBeenCalledOnce())

    act(() => statusCallback('connected'))
    expect(screen.getByTitle('Market stream: connected')).toHaveTextContent('Live market data')
    act(() => eventCallback({ type: 'heartbeat', data: { marketDataConnected: false, serverTime: new Date().toISOString() } }))
    expect(screen.getByTitle('Market stream: reconnecting')).toHaveTextContent('Connecting to live feed')
    act(() => statusCallback('connected'))
    expect(screen.getByTitle('Market stream: connected')).toHaveTextContent('Live market data')
  })
})
