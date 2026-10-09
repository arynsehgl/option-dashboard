/**
 * Provides the review-first order draft used by Trade Zone while keeping live
 * submission disabled unless the release explicitly enables it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldCheck, X } from 'lucide-react'

/**
 * Creates one browser-local key that can safely identify retries of a draft.
 */
function createOrderIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Renders a review-first Kite order ticket with hard environment safeguards.
 */
export default function OrderTicket({ instrument, environment, connected, onSubmit, onRefresh, liveOrderingEnabled = false }) {
  const [side, setSide] = useState('BUY')
  const [quantity, setQuantity] = useState(1)
  const [orderType, setOrderType] = useState('MARKET')
  const [product, setProduct] = useState('CNC')
  const [variety, setVariety] = useState('regular')
  const [validity, setValidity] = useState('DAY')
  const [price, setPrice] = useState(instrument.price)
  const [triggerPrice, setTriggerPrice] = useState(instrument.price)
  const [validityTtl, setValidityTtl] = useState(60)
  const [icebergLegs, setIcebergLegs] = useState(2)
  const [icebergQuantity, setIcebergQuantity] = useState(1)
  const [auctionNumber, setAuctionNumber] = useState('')
  const [autoslice, setAutoslice] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const idempotencyKeyRef = useRef(null)
  const estimatedValue = useMemo(() => Number(quantity || 0) * Number(orderType === 'MARKET' ? instrument.price : price || 0), [quantity, orderType, price, instrument.price])
  const paperMode = environment === 'paper'
  const disabledReason = paperMode
    ? 'Manual paper orders are disabled. V2 strategy drafts remain non-executing until guarded automation is enabled.'
    : !liveOrderingEnabled
      ? 'Live order entry is disabled for the V2 release while production execution safeguards are completed.'
      : !connected
        ? 'Connect a valid Kite session before reviewing a live order.'
        : ''
  const draftFingerprint = useMemo(() => JSON.stringify({
    instrumentKey: instrument.instrumentKey,
    side,
    quantity,
    orderType,
    product,
    variety,
    validity,
    price,
    triggerPrice,
    validityTtl,
    icebergLegs,
    icebergQuantity,
    auctionNumber,
    autoslice,
  }), [instrument.instrumentKey, side, quantity, orderType, product, variety, validity, price, triggerPrice, validityTtl, icebergLegs, icebergQuantity, auctionNumber, autoslice])
  const previousDraftFingerprintRef = useRef(draftFingerprint)

  // A newly selected instrument must never inherit prices or confirmation state.
  useEffect(() => {
    setPrice(instrument.price)
    setTriggerPrice(instrument.price)
    setShowReview(false)
    setFeedback('')
    idempotencyKeyRef.current = null
  }, [instrument.instrumentKey])

  // Material draft edits create a new order intent and therefore a new retry key.
  useEffect(() => {
    if (previousDraftFingerprintRef.current === draftFingerprint) return
    previousDraftFingerprintRef.current = draftFingerprint
    setShowReview(false)
    setFeedback('')
    idempotencyKeyRef.current = null
  }, [draftFingerprint])

  /**
   * Submits the explicitly reviewed order and reports its broker acknowledgement.
   */
  async function confirmOrder() {
    const idempotencyKey = idempotencyKeyRef.current || createOrderIdempotencyKey()
    idempotencyKeyRef.current = idempotencyKey
    setSubmitting(true)
    setFeedback('')
    try {
      await onSubmit({
        instrumentKey: instrument.instrumentKey,
        exchange: instrument.exchange,
        tradingsymbol: instrument.symbol,
        transactionType: side,
        quantity: Number(quantity),
        orderType,
        product,
        variety,
        validity,
        autoslice,
        ...(!['MARKET', 'SL-M'].includes(orderType) ? { price: Number(price) } : {}),
        ...(['SL', 'SL-M'].includes(orderType) ? { triggerPrice: Number(triggerPrice) } : {}),
        ...(validity === 'TTL' ? { validityTtl: Number(validityTtl) } : {}),
        ...(variety === 'iceberg' ? { icebergLegs: Number(icebergLegs), icebergQuantity: Number(icebergQuantity) } : {}),
        ...(variety === 'auction' ? { auctionNumber: Number(auctionNumber) } : {}),
      }, idempotencyKey)
      setFeedback('Order acknowledged. Check the Orders tab for broker status.')
      setShowReview(false)
      idempotencyKeyRef.current = null
      try {
        await onRefresh?.()
      } catch {
        setFeedback('Order acknowledged, but the order book could not refresh automatically. Refresh Trade Zone before taking another action.')
      }
    } catch (error) {
      setFeedback(error.message || 'The broker response was inconclusive. Retry this unchanged draft to reuse the same safety key.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!paperMode && !liveOrderingEnabled) {
    return (
      <section className="glass-panel-strong overflow-hidden rounded-3xl">
        <div className="border-b border-[var(--glass-border)] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Order ticket</p><h2 className="mt-1 font-black text-ink">Live execution locked</h2></div>
        <div className="p-5"><div className="flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-700 dark:text-amber-200"><LockKeyhole size={18} className="mt-0.5 shrink-0" /><p>V2 provides a read-only live market view. Real-money order entry remains unavailable until the production execution and exit safeguards are released.</p></div></div>
      </section>
    )
  }

  return (
    <section className="glass-panel-strong overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] p-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Order ticket</p><h2 className="mt-1 font-black text-ink">{instrument.symbol}</h2></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${paperMode ? 'bg-violet-500/10 text-violet-500' : 'bg-amber-500/10 text-amber-500'}`}>{paperMode ? 'PLAYGROUND' : 'LIVE'}</span></div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSide('BUY')} className={`rounded-xl py-2.5 text-sm font-black ${side === 'BUY' ? 'bg-emerald-500 text-white' : 'surface-muted text-muted'}`}>Buy</button><button type="button" onClick={() => setSide('SELL')} className={`rounded-xl py-2.5 text-sm font-black ${side === 'SELL' ? 'bg-rose-500 text-white' : 'surface-muted text-muted'}`}>Sell</button></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-muted">Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label>
          <label className="text-xs font-bold text-muted">Product<select value={product} onChange={(event) => setProduct(event.target.value)} className="form-control mt-1.5 py-2 text-sm"><option>CNC</option><option>MIS</option><option>NRML</option></select></label>
          <label className="text-xs font-bold text-muted">Order type<select value={orderType} onChange={(event) => setOrderType(event.target.value)} className="form-control mt-1.5 py-2 text-sm"><option>MARKET</option><option>LIMIT</option><option>SL</option><option>SL-M</option></select></label>
          <label className="text-xs font-bold text-muted">Price<input type="number" step="0.05" disabled={['MARKET', 'SL-M'].includes(orderType)} value={price} onChange={(event) => setPrice(event.target.value)} className="form-control mt-1.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45" /></label>
          <label className="text-xs font-bold text-muted">Variety<select value={variety} onChange={(event) => setVariety(event.target.value)} className="form-control mt-1.5 py-2 text-sm"><option value="regular">Regular</option><option value="amo">AMO</option><option value="co">Cover</option><option value="iceberg">Iceberg</option><option value="auction">Auction</option></select></label>
          <label className="text-xs font-bold text-muted">Validity<select value={validity} onChange={(event) => setValidity(event.target.value)} className="form-control mt-1.5 py-2 text-sm"><option>DAY</option><option>IOC</option><option>TTL</option></select></label>
          {['SL', 'SL-M'].includes(orderType) && <label className="col-span-2 text-xs font-bold text-muted">Trigger price<input type="number" step="0.05" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label>}
          {validity === 'TTL' && <label className="col-span-2 text-xs font-bold text-muted">Validity minutes<input type="number" min="1" max="1440" value={validityTtl} onChange={(event) => setValidityTtl(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label>}
          {variety === 'iceberg' && <><label className="text-xs font-bold text-muted">Iceberg legs<input type="number" min="2" max="10" value={icebergLegs} onChange={(event) => setIcebergLegs(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label><label className="text-xs font-bold text-muted">Quantity per leg<input type="number" min="1" value={icebergQuantity} onChange={(event) => setIcebergQuantity(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label></>}
          {variety === 'auction' && <label className="col-span-2 text-xs font-bold text-muted">Auction number<input type="number" min="1" value={auctionNumber} onChange={(event) => setAuctionNumber(event.target.value)} className="form-control mt-1.5 py-2 text-sm" /></label>}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-muted"><input type="checkbox" checked={autoslice} onChange={(event) => setAutoslice(event.target.checked)} className="h-4 w-4 accent-indigo-600" />Auto-slice quantities above exchange freeze limits</label>
        <div className="surface-muted mt-4 rounded-xl p-3 text-xs"><div className="flex justify-between text-muted"><span>Estimated value</span><strong className="text-ink">₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></div><div className="mt-2 flex justify-between text-muted"><span>Margin and charges</span><strong className="text-ink">Calculated before submit</strong></div></div>
        {disabledReason && <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-600 dark:text-amber-300"><LockKeyhole size={16} className="mt-0.5 shrink-0" />{disabledReason}</div>}
        {feedback && !showReview && <div role="status" className="mt-4 rounded-xl bg-indigo-500/10 p-3 text-xs font-semibold text-indigo-500">{feedback}</div>}
        <button type="button" disabled={Boolean(disabledReason) || !quantity} onClick={() => setShowReview(true)} className={`mt-4 w-full rounded-xl py-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-45 ${side === 'BUY' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>Review {side.toLowerCase()} order</button>
      </div>

      {showReview && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="order-review-title">
          <div className="glass-panel-strong w-full max-w-md rounded-3xl p-6">
            <div className="flex items-start justify-between"><div><p className="eyebrow">Final live confirmation</p><h3 id="order-review-title" className="mt-2 text-2xl font-black text-ink">Review broker order</h3></div><button type="button" onClick={() => setShowReview(false)} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-rose-500/10 hover:text-rose-500" aria-label="Close review"><X size={18} /></button></div>
            <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200"><div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" /><p>This submits a real order to Zerodha after confirmation. Verify every field.</p></div></div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">{[['Instrument', instrument.symbol], ['Side', side], ['Quantity', quantity], ['Product', product], ['Type', `${variety} · ${orderType}`], ['Est. value', `₹${estimatedValue.toLocaleString('en-IN')}`]].map(([term, value]) => <div key={term} className="surface-muted rounded-xl p-3"><dt className="text-xs text-muted">{term}</dt><dd className="mt-1 font-black text-ink">{value}</dd></div>)}</dl>
            <div className="mt-5 flex items-center gap-2 text-xs text-muted"><ShieldCheck size={16} className="text-emerald-500" />Idempotency and broker reconciliation are applied.</div>
            {feedback && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600 dark:text-rose-300">{feedback}</div>}
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setShowReview(false)} className="btn-secondary">Cancel</button><button type="button" onClick={confirmOrder} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? 'Submitting…' : <><CheckCircle2 size={17} />Confirm live</>}</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
