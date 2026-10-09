/**
 * Renders the authenticated Trade Zone with environment-isolated data loading,
 * bounded market-stream recovery, and V2 paper-first execution controls.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Bell,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  Layers3,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  WalletCards,
  Workflow,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import ThemeToggle from '../components/ThemeToggle'
import ZoneRopeSwitch from '../components/ZoneRopeSwitch'
import { useAuth } from '../contexts/AuthContext'
import AIWorkbench from '../features/trade-zone/components/AIWorkbench'
import AlgoBuilder from '../features/trade-zone/components/AlgoBuilder'
import MarketChart from '../features/trade-zone/components/MarketChart'
import MarketDataStatus from '../features/trade-zone/components/MarketDataStatus'
import OrderTicket from '../features/trade-zone/components/OrderTicket'
import KiteSetupDialog from '../features/trade-zone/components/KiteSetupDialog'
import Watchlist from '../features/trade-zone/components/Watchlist'
import {
  addWatchlistInstrument,
  getKiteLoginUrl,
  getInstrumentCandles,
  getTradeOverview,
  isTradeWorkerConfigured,
  openMarketStream,
  saveKiteCredentials,
  savePaperStrategy,
  searchInstruments,
  startAiResearchRun,
  submitLiveOrder,
} from '../features/trade-zone/tradeApi'
import {
  applyTicksToOverview,
  applyTickToInstrument,
  collectStreamInstrumentTokens,
  deriveFeedHealth,
  mergeTickIntoCandles,
} from '../features/trade-zone/liveMarket'

const tabs = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'orders', label: 'Orders', icon: FileClock },
  { id: 'algo', label: 'Algo Trading', icon: Workflow },
  { id: 'ai', label: 'Trade with AI', icon: Bot },
  { id: 'logs', label: 'Logs', icon: Layers3 },
]

const LIVE_ORDERING_ENABLED = false
const MAX_STREAM_ATTEMPTS = 3

/**
 * Returns a short capped delay for each automatic market-stream retry.
 */
function streamRetryDelay(attemptNumber) {
  return Math.min(4000, 1000 * (2 ** Math.max(0, attemptNumber - 1)))
}

/**
 * Formats rupee values consistently throughout the trading workspace.
 */
function currency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0))
}

/**
 * Renders the complete Trade Zone workspace and its guarded mode boundaries.
 */
export default function TradeZone() {
  const { section } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, userData, logout } = useAuth()
  const activeTab = tabs.some((tab) => tab.id === section) ? section : 'overview'
  const [environment, setEnvironment] = useState('paper')
  const [overview, setOverview] = useState(null)
  const [selectedInstrument, setSelectedInstrument] = useState(null)
  const [candles, setCandles] = useState([])
  const [interval, setInterval] = useState('15m')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [streamStatus, setStreamStatus] = useState('idle')
  const [lastSignalAt, setLastSignalAt] = useState(null)
  const [lastTickAt, setLastTickAt] = useState(null)
  const [healthClock, setHealthClock] = useState(Date.now())
  const [demoMode, setDemoMode] = useState(false)
  const [showKiteSetup, setShowKiteSetup] = useState(false)
  const [streamRetryGeneration, setStreamRetryGeneration] = useState(0)
  const overviewRequestIdRef = useRef(0)
  const candleRequestIdRef = useRef(0)
  const selectedInstrumentRef = useRef(selectedInstrument)
  const intervalRef = useRef(interval)
  const workerConfigured = isTradeWorkerConfigured()
  selectedInstrumentRef.current = selectedInstrument
  intervalRef.current = interval

  useEffect(() => {
    const brokerResult = new URLSearchParams(location.search).get('broker')
    if (!brokerResult) return
    setConnectionMessage(brokerResult === 'connected'
      ? 'Kite is connected for today’s market data. Playground execution remains virtual.'
      : 'Kite login did not complete. No paper or live order was submitted.')
    navigate('/trade-zone', { replace: true })
  }, [location.search, navigate])

  /**
   * Loads one environment snapshot and ignores responses invalidated by a
   * newer environment, demo-mode, or manual refresh request.
   */
  async function loadOverview({ requestedEnvironment = environment, requestedDemoMode = demoMode, clearCurrent = false } = {}) {
    const requestId = overviewRequestIdRef.current + 1
    overviewRequestIdRef.current = requestId
    setLoading(true)
    setError('')
    if (clearCurrent) {
      setOverview(null)
      setSelectedInstrument(null)
      setCandles([])
    }
    try {
      const nextOverview = await getTradeOverview(requestedEnvironment, requestedDemoMode)
      if (requestId !== overviewRequestIdRef.current) return
      if (nextOverview.environment !== requestedEnvironment) throw new Error('Trade Worker returned data for a different trading environment.')
      setOverview(nextOverview)
      setSelectedInstrument((current) => nextOverview.watchlist.find((instrument) => instrument.instrumentKey === current?.instrumentKey) || nextOverview.watchlist[0] || null)
    } catch (loadError) {
      if (requestId !== overviewRequestIdRef.current) return
      setError(loadError.message)
    } finally {
      if (requestId === overviewRequestIdRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview({ requestedEnvironment: environment, requestedDemoMode: demoMode, clearCurrent: true })
    return () => {
      overviewRequestIdRef.current += 1
    }
  }, [environment, demoMode])

  useEffect(() => {
    const requestId = candleRequestIdRef.current + 1
    candleRequestIdRef.current = requestId
    if (!selectedInstrument) {
      setCandles([])
      return undefined
    }
    if (!demoMode && overview?.connection?.status !== 'connected') {
      setCandles([])
      return undefined
    }
    setCandles([])
    getInstrumentCandles(selectedInstrument.instrumentKey, interval, demoMode)
      .then((nextCandles) => {
        if (requestId === candleRequestIdRef.current) setCandles(nextCandles)
      })
      .catch((chartError) => {
        if (requestId === candleRequestIdRef.current) setError(chartError.message)
      })
    return () => {
      if (requestId === candleRequestIdRef.current) candleRequestIdRef.current += 1
    }
  }, [selectedInstrument?.instrumentKey, interval, demoMode, overview?.connection?.status])

  const activeOverview = overview?.environment === environment ? overview : null
  const connected = activeOverview?.connection?.status === 'connected'
  const demo = activeOverview?.mode === 'demo'
  const disconnected = activeOverview?.mode === 'disconnected'
  const streamTokens = useMemo(() => collectStreamInstrumentTokens(activeOverview, selectedInstrument), [activeOverview, selectedInstrument])
  const streamTokenKey = streamTokens.join(',')
  const feedHealth = useMemo(() => deriveFeedHealth({ connected, streamStatus, lastSignalAt, now: healthClock }), [connected, streamStatus, lastSignalAt, healthClock])
  const totalHoldingValue = useMemo(() => activeOverview?.holdings?.reduce((total, item) => total + item.ltp * item.quantity, 0) || 0, [activeOverview])

  useEffect(() => {
    if (!connected) return undefined
    const timer = window.setInterval(() => setHealthClock(Date.now()), 2000)
    return () => window.clearInterval(timer)
  }, [connected])

  useEffect(() => {
    if (!connected || !workerConfigured || demo) {
      setStreamStatus('idle')
      return undefined
    }
    let activeSocket = null
    let cancelled = false
    let retryTimer = null
    let attemptCount = 0
    let connectionGeneration = 0
    setStreamStatus('connecting')
    setLastSignalAt(null)
    setLastTickAt(null)

    /**
     * Schedules the next bounded retry for the currently active socket only.
     */
    function scheduleReconnect(generation, reason) {
      if (cancelled || generation !== connectionGeneration || retryTimer) return
      if (attemptCount >= MAX_STREAM_ATTEMPTS) {
        setStreamStatus('error')
        setConnectionMessage(`Market stream stopped after ${MAX_STREAM_ATTEMPTS} attempts${reason ? `: ${reason}` : '.'}`)
        return
      }
      setStreamStatus('reconnecting')
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void connectStream()
      }, streamRetryDelay(attemptCount))
    }

    /**
     * Opens one stream attempt and rejects events from replaced sockets.
     */
    async function connectStream() {
      attemptCount += 1
      const generation = connectionGeneration + 1
      connectionGeneration = generation
      let socketForAttempt = null
      setStreamStatus(attemptCount === 1 ? 'connecting' : 'reconnecting')
      try {
        const socket = await openMarketStream(streamTokens, (event) => {
          if (cancelled || generation !== connectionGeneration) return
          const receivedAt = Date.now()
          if (event.type === 'heartbeat' && event.data?.marketDataConnected !== true) {
            setStreamStatus('reconnecting')
            setLastSignalAt(null)
            return
          }
          if ((event.type === 'heartbeat' && event.data?.marketDataConnected === true) || (event.type === 'status' && event.status === 'connected')) {
            setLastSignalAt(event.data?.serverTime || new Date(receivedAt).toISOString())
          }
          if (event.type !== 'ticks' || !Array.isArray(event.data)) return
          setLastSignalAt(new Date(receivedAt).toISOString())
          setLastTickAt(event.receivedAt || new Date(receivedAt).toISOString())
          setOverview((current) => applyTicksToOverview(current, event.data, receivedAt))
          const tickByToken = new Map(event.data.map((tick) => [Number(tick.instrument_token), tick]))
          setSelectedInstrument((current) => {
            const tick = current && tickByToken.get(Number(current.instrumentToken))
            return tick ? applyTickToInstrument(current, tick, receivedAt) : current
          })
          setCandles((current) => {
            const currentInstrument = selectedInstrumentRef.current
            const tick = currentInstrument && tickByToken.get(Number(currentInstrument.instrumentToken))
            return tick ? mergeTickIntoCandles(current, tick, intervalRef.current, receivedAt) : current
          })
        }, (status) => {
          if (cancelled || generation !== connectionGeneration) return
          setStreamStatus(status)
          if (status === 'connected') {
            attemptCount = 0
            setLastSignalAt(new Date().toISOString())
            setConnectionMessage('')
          }
          if (status === 'reconnecting') setLastSignalAt(null)
          if (status === 'error' || status === 'unavailable' || status === 'invalid-message') {
            const failedSocket = socketForAttempt
            socketForAttempt = null
            if (activeSocket === failedSocket) activeSocket = null
            failedSocket?.close()
            scheduleReconnect(generation, status)
          } else if (status === 'closed') {
            if (activeSocket === socketForAttempt) activeSocket = null
            socketForAttempt = null
            scheduleReconnect(generation, status)
          }
        })
        socketForAttempt = socket
        if (cancelled || generation !== connectionGeneration) {
          socket?.close()
          return
        }
        activeSocket = socket
        if (!socket) scheduleReconnect(generation, 'worker returned no socket')
      } catch (streamError) {
        if (cancelled || generation !== connectionGeneration) return
        scheduleReconnect(generation, streamError.message)
      }
    }

    void connectStream()
    return () => {
      cancelled = true
      connectionGeneration += 1
      if (retryTimer) window.clearTimeout(retryTimer)
      activeSocket?.close()
    }
  }, [connected, workerConfigured, streamTokenKey, demo, streamRetryGeneration])

  /**
   * Starts Kite OAuth through the backend-only login endpoint.
   */
  async function connectKite() {
    setConnectionMessage('')
    try {
      const result = await getKiteLoginUrl()
      if (!result?.url) throw new Error('The worker did not return a Kite login URL.')
      window.location.assign(result.url)
    } catch (connectError) {
      setConnectionMessage(connectError.message)
    }
  }

  /**
   * Encrypts personal app credentials on the worker and continues to Kite authentication.
   */
  async function configureKite(credentials) {
    await saveKiteCredentials(credentials)
    setShowKiteSetup(false)
    await connectKite()
  }

  /**
   * Selects the safe daily connection action without submitting any broker order.
   */
  function handleConnectionAction() {
    if (!workerConfigured) {
      setConnectionMessage('Configure VITE_TRADE_WORKER_URL and start the Trade Worker before connecting Kite.')
      return
    }
    if (activeOverview?.connection?.status === 'not_configured') {
      setShowKiteSetup(true)
      return
    }
    void connectKite()
  }

  /**
   * Signs out of Strikeview and returns to the public landing page.
   */
  async function handleLogout() {
    await logout()
    navigate('/')
  }

  /**
   * Changes a Trade Zone subsection while keeping a stable route for refreshes.
   */
  function selectTab(tabId) {
    navigate(tabId === 'overview' ? '/trade-zone' : `/trade-zone/${tabId}`)
  }

  /**
   * Invalidates the current snapshot before requesting another environment.
   */
  function selectEnvironment(nextEnvironment) {
    if (nextEnvironment === environment) return
    overviewRequestIdRef.current += 1
    candleRequestIdRef.current += 1
    setOverview(null)
    setSelectedInstrument(null)
    setCandles([])
    setError('')
    setConnectionMessage('')
    setStreamStatus('idle')
    setLoading(true)
    setEnvironment(nextEnvironment)
  }

  /**
   * Starts a fresh bounded stream lifecycle after automatic retries stop.
   */
  function reconnectMarketStream() {
    setConnectionMessage('')
    setStreamStatus('connecting')
    setStreamRetryGeneration((current) => current + 1)
  }

  /**
   * Invalidates current data before entering or leaving the explicit demo.
   */
  function selectDemoMode(nextDemoMode) {
    if (nextDemoMode === demoMode) return
    overviewRequestIdRef.current += 1
    candleRequestIdRef.current += 1
    setOverview(null)
    setSelectedInstrument(null)
    setCandles([])
    setError('')
    setLoading(true)
    setDemoMode(nextDemoMode)
  }

  /**
   * Adds one master instrument and refreshes the broker-marked watchlist.
   */
  async function addInstrument(instrumentKey) {
    await addWatchlistInstrument(instrumentKey)
    await loadOverview()
  }

  const streamNeedsManualReconnect = Boolean(connected && !demo && ['error', 'closed', 'unavailable', 'invalid-message'].includes(streamStatus))

  if (loading && !activeOverview) {
    return <div className="app-background grid min-h-screen place-items-center"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-indigo-500" /><p className="mt-3 text-sm font-semibold text-muted">Preparing Trade Zone…</p></div></div>
  }

  return (
    <div className="app-background min-h-screen text-ink">
      <ZoneRopeSwitch currentZone="trade-zone" />
      <header className="relative z-40 px-3 pt-3 sm:px-5">
        <div className="glass-toolbar mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 rounded-[1.35rem] px-3 py-3 pr-16 sm:pr-24">
          <Link to="/zones" className="mr-auto"><BrandMark /></Link>
          <div className="surface-muted flex rounded-xl p-1" aria-label="Trading environment">
            <button type="button" onClick={() => selectEnvironment('paper')} className={`rounded-lg px-3 py-2 text-xs font-black transition sm:px-4 ${environment === 'paper' ? 'bg-violet-600 text-white shadow-lg' : 'text-muted hover:text-ink'}`}>Playground</button>
            <button type="button" onClick={() => selectEnvironment('live')} className={`rounded-lg px-3 py-2 text-xs font-black transition sm:px-4 ${environment === 'live' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-muted hover:text-ink'}`}>Live view</button>
          </div>
          <button type="button" onClick={streamNeedsManualReconnect ? reconnectMarketStream : connected ? () => void loadOverview() : handleConnectionAction} title={streamNeedsManualReconnect ? 'Reconnect the market stream' : connected ? `Market stream: ${streamStatus}` : 'Connect the daily Kite market-data session'} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${connected && feedHealth.state === 'live' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500' : 'border-amber-400/25 bg-amber-500/10 text-amber-600 dark:text-amber-300'}`}>
            {connected && !streamNeedsManualReconnect ? <CheckCircle2 size={15} /> : <Unplug size={15} />}{streamNeedsManualReconnect ? 'Reconnect feed' : connected ? feedHealth.label : workerConfigured && activeOverview?.connection?.status === 'not_configured' ? 'Set up Kite' : workerConfigured ? 'Connect Kite' : 'Worker offline'}
          </button>
          <ThemeToggle />
          <button type="button" onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-rose-500/10 hover:text-rose-500" title="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <div className={`${environment === 'paper' ? 'border-violet-400/25 bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'} relative z-20 mx-3 mt-2 rounded-2xl border px-4 py-2 text-center text-xs font-bold backdrop-blur-xl sm:mx-5`}>
        {environment === 'paper' ? 'PLAYGROUND • ₹10,00,000 VIRTUAL CAPITAL • KITE IS DATA-ONLY • NO REAL-MONEY ORDER PATH' : 'LIVE VIEW • MARKET AND PORTFOLIO ARE READ-ONLY • REAL-MONEY ORDER ENTRY IS DISABLED IN V2'}
      </div>

      <nav className="relative z-20 mt-2 px-3 sm:px-5" aria-label="Trade Zone sections">
        <div className="glass-toolbar mx-auto flex max-w-[1800px] gap-1 overflow-x-auto rounded-2xl px-2 py-2">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => selectTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition sm:px-4 ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/15' : 'text-muted hover:bg-indigo-500/10 hover:text-ink'}`}><Icon size={15} />{label}</button>)}
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-[1800px] px-3 py-5 sm:px-5">
        {(error || connectionMessage) && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><p className="font-black">Trade Zone needs attention</p><p className="mt-1">{error || connectionMessage}</p></div></div>}
        <MarketDataStatus
          workerConfigured={workerConfigured}
          demo={demo}
          connected={connected}
          feedHealth={feedHealth}
          lastTickAt={lastTickAt}
          onConnect={handleConnectionAction}
          onOpenDemo={() => selectDemoMode(true)}
          onExitDemo={() => selectDemoMode(false)}
        />

        {activeTab === 'overview' && activeOverview && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [WalletCards, environment === 'paper' ? 'Virtual cash available' : 'Available funds', currency(activeOverview.funds.available), `${currency(activeOverview.funds.used)} used`, 'text-indigo-500'],
                [CircleDollarSign, 'Day P&L', currency(activeOverview.pnl.day), activeOverview.pnl.day >= 0 ? 'Positive today' : 'Down today', activeOverview.pnl.day >= 0 ? 'text-emerald-500' : 'text-rose-500'],
                [BriefcaseBusiness, environment === 'paper' ? 'Virtual equity' : 'Holdings value', currency(environment === 'paper' ? activeOverview.funds.equity : totalHoldingValue), environment === 'paper' ? `${currency(activeOverview.funds.opening)} starting capital` : `${activeOverview.holdings.length} instruments`, 'text-cyan-500'],
                [ShieldCheck, 'Risk utilisation', '0.5%', '2% daily stop', 'text-violet-500'],
              ].map(([Icon, label, value, detail, color]) => <article key={label} className="glass-card rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-muted">{label}</p><Icon size={17} className={color} /></div><p className={`mt-3 text-xl font-black ${label === 'Day P&L' ? color : 'text-ink'}`}>{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>)}
            </section>
            <section className="grid min-w-0 gap-4 xl:grid-cols-[15.5rem_minmax(0,1fr)_19rem]">
              <Watchlist instruments={activeOverview.watchlist} selectedKey={selectedInstrument?.instrumentKey} onSelect={setSelectedInstrument} onSearch={workerConfigured ? searchInstruments : null} onAdd={workerConfigured ? addInstrument : null} />
              {selectedInstrument ? <MarketChart instrument={selectedInstrument} candles={candles} interval={interval} onIntervalChange={setInterval} preview={demo} feedHealth={feedHealth} /> : <section className="glass-panel-strong grid min-h-[480px] place-items-center rounded-3xl p-8 text-center"><div><Search size={28} className="mx-auto text-indigo-500" /><h2 className="mt-4 text-xl font-black text-ink">{disconnected ? 'Connect live market data' : 'Build your watchlist'}</h2><p className="mt-2 max-w-sm text-sm text-muted">{disconnected ? 'Configure the Trade Worker and connect Kite; Strikeview will never substitute fixed values for a live feed.' : 'Search the Kite instrument master on the left and add a company, index, future, or option.'}</p></div></section>}
              {selectedInstrument ? <OrderTicket instrument={selectedInstrument} environment={environment} connected={connected && workerConfigured} liveOrderingEnabled={LIVE_ORDERING_ENABLED} onSubmit={submitLiveOrder} onRefresh={() => loadOverview()} /> : <section className="glass-panel-strong rounded-3xl p-5"><p className="eyebrow">Order ticket</p><p className="mt-3 text-sm text-muted">Select an instrument to prepare an order.</p></section>}
            </section>
            <PortfolioTable holdings={activeOverview.holdings} preview={demo} environment={environment} />
          </div>
        )}

        {activeTab === 'orders' && activeOverview && <OrdersWorkspace orders={activeOverview.orders} connected={connected} preview={demo} />}
        {activeTab === 'algo' && <AlgoBuilder onSave={savePaperStrategy} instruments={activeOverview?.watchlist || []} />}
        {activeTab === 'ai' && activeOverview && <AIWorkbench report={activeOverview.report} onRun={() => startAiResearchRun(demo)} preview={demo} connected={connected} feedLive={feedHealth.state === 'live'} />}
        {activeTab === 'logs' && <AuditLog events={activeOverview?.auditEvents || []} preview={demo} userName={userData?.name || currentUser?.email} />}
      </main>
      {showKiteSetup && <KiteSetupDialog onClose={() => setShowKiteSetup(false)} onSave={configureKite} />}
    </div>
  )
}

/**
 * Displays holdings and their marked-to-market contribution.
 */
function PortfolioTable({ holdings, preview, environment }) {
  return (
    <section className="glass-panel-strong overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4"><div><p className="eyebrow">{environment === 'paper' ? 'Virtual portfolio' : 'Broker portfolio'}</p><h2 className="mt-1 font-black text-ink">{environment === 'paper' ? 'Paper positions' : 'Holdings'}</h2></div>{preview && <span className="text-[10px] font-black text-amber-500">DEMO</span>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-indigo-500/5 text-xs uppercase tracking-[0.1em] text-muted"><tr>{['Instrument', 'Quantity', 'Average', 'LTP', 'Current value', 'P&L'].map((heading) => <th key={heading} className="px-5 py-3 font-black">{heading}</th>)}</tr></thead><tbody>{holdings.map((holding) => <tr key={`${holding.exchange || ''}:${holding.symbol}`} className="border-t border-[var(--glass-border)]"><td className="px-5 py-4 font-black text-ink">{holding.symbol}</td><td className="px-5 py-4 text-muted">{holding.quantity}</td><td className="px-5 py-4 text-muted">{currency(holding.average)}</td><td className={`px-5 py-4 font-bold ${holding.direction === 'up' ? 'text-emerald-500' : holding.direction === 'down' ? 'text-rose-500' : 'text-ink'}`}>{currency(holding.ltp)}</td><td className="px-5 py-4 text-ink">{currency(holding.ltp * holding.quantity)}</td><td className={`px-5 py-4 font-black ${holding.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{currency(holding.pnl)}</td></tr>)}{!holdings.length && <tr><td colSpan="6" className="px-5 py-10 text-center text-sm text-muted">No {environment === 'paper' ? 'paper positions' : 'broker holdings'} yet.</td></tr>}</tbody></table></div>
    </section>
  )
}

/**
 * Displays broker orders and the advanced API capability entry points.
 */
function OrdersWorkspace({ orders, connected, preview }) {
  const capabilities = [
    [Boxes, 'Basket margins', 'Read-only preview; live mutation is disabled in V2'],
    [Bell, 'GTT / OCO', 'Preview only; no broker trigger can be created'],
    [Workflow, 'Advanced orders', 'Order entry remains locked for this release'],
    [RefreshCw, 'Conversions', 'Position conversion remains unavailable in V2'],
  ]
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map(([Icon, title, copy]) => <article key={title} className={`glass-card rounded-2xl p-5 ${connected ? '' : 'opacity-50'}`}><Icon size={20} className="text-indigo-500" /><h2 className="mt-4 font-black text-ink">{title}</h2><p className="mt-1 text-sm text-muted">{copy}</p></article>)}</section>
      <section className="glass-panel-strong overflow-hidden rounded-3xl"><div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4"><div><p className="eyebrow">Order book</p><h2 className="mt-1 text-xl font-black text-ink">Orders and trade status</h2></div>{preview && <span className="text-[10px] font-black text-amber-500">DEMO DATA</span>}</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-indigo-500/5 text-xs uppercase tracking-[0.1em] text-muted"><tr>{['Time', 'Instrument', 'Side', 'Qty', 'Type', 'Price', 'Source', 'Status'].map((heading) => <th key={heading} className="px-5 py-3 font-black">{heading}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[var(--glass-border)]"><td className="px-5 py-4 text-muted">{order.time}</td><td className="px-5 py-4 font-black text-ink">{order.symbol}</td><td className={`px-5 py-4 font-black ${order.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>{order.side}</td><td className="px-5 py-4 text-ink">{order.quantity}</td><td className="px-5 py-4 text-muted">{order.type}</td><td className="px-5 py-4 text-ink">{currency(order.price)}</td><td className="px-5 py-4 text-muted">{order.source}</td><td className="px-5 py-4"><span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-black text-indigo-500">{order.status}</span></td></tr>)}{!orders.length && <tr><td colSpan="8" className="px-5 py-10 text-center text-sm text-muted">No orders have been recorded.</td></tr>}</tbody></table></div></section>
    </div>
  )
}

/**
 * Displays an append-only style audit timeline for user-visible system decisions.
 */
function AuditLog({ events, preview, userName }) {
  return (
    <section className="glass-panel-strong rounded-3xl p-5 sm:p-6"><div className="flex flex-col gap-3 border-b border-[var(--glass-border)] pb-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Append-only audit</p><h1 className="mt-1 text-2xl font-black text-ink">Decision and execution log</h1><p className="mt-2 text-sm text-muted">Visible to {userName || 'the current user'} only.</p></div>{preview && <span className="self-start rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-500">DEMO EVENTS</span>}</div><ol className="mt-6 space-y-3">{events.map((event) => { const rejected = event.type.includes('REJECT') || event.type.includes('FAILED'); const safe = event.type.includes('APPROVED') || event.type.includes('CONNECTED') || event.type.includes('FILLED'); return <li key={event.id} className="surface-muted grid gap-3 rounded-2xl p-4 sm:grid-cols-[6rem_13rem_1fr]"><time className="text-xs font-black text-muted">{new Date(event.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span className={`text-xs font-black ${safe ? 'text-emerald-500' : rejected ? 'text-amber-500' : 'text-indigo-500'}`}>{event.type}</span><p className="text-sm text-muted">{event.summary}</p></li> })}{!events.length && <li className="surface-muted rounded-2xl p-6 text-center text-sm text-muted">No audit events have been recorded for this account yet.</li>}</ol></section>
  )
}
