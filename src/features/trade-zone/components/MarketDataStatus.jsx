/** Reports broker and market-feed truth with recovery and preview actions. */
import React from 'react'
import { Clock3, FlaskConical, Radio, ServerOff, ShieldCheck, Unplug } from 'lucide-react'

/**
 * Displays the truthful relationship between Kite market data and paper execution.
 */
export default function MarketDataStatus({
  workerConfigured,
  demo,
  connected,
  feedHealth,
  lastTickAt,
  onConnect,
  onOpenDemo,
  onExitDemo,
}) {
  if (demo) {
    return (
      <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Demo market data status">
        <div className="flex items-start gap-3"><FlaskConical size={19} className="mt-0.5 shrink-0 text-amber-500" /><div><p className="font-black text-ink">Demo Tour — fixed sample values</p><p className="mt-1 text-muted">This screen is not connected to Kite. Prices do not move and every order, P&amp;L value, and report is illustrative.</p></div></div>
        <button type="button" onClick={onExitDemo} className="btn-secondary shrink-0 text-xs">Exit demo</button>
      </section>
    )
  }

  if (!workerConfigured) {
    return (
      <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-400/25 bg-slate-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Trade Worker status">
        <div className="flex items-start gap-3"><ServerOff size={19} className="mt-0.5 shrink-0 text-slate-500" /><div><p className="font-black text-ink">Live market service is not configured</p><p className="mt-1 text-muted">Add the Trade Worker URL and start the worker before connecting Kite. Strikeview is showing an empty ₹10 lakh virtual account—not fake live prices.</p></div></div>
        <button type="button" onClick={onOpenDemo} className="btn-secondary shrink-0 text-xs"><FlaskConical size={15} />Open Demo Tour</button>
      </section>
    )
  }

  if (!connected) {
    return (
      <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Kite connection status">
        <div className="flex items-start gap-3"><Unplug size={19} className="mt-0.5 shrink-0 text-amber-500" /><div><p className="font-black text-ink">Connect Kite for today’s live market data</p><p className="mt-1 text-muted">Playground remains virtual, but AI, Algo, charts, and mark-to-market updates wait for an authenticated live feed.</p></div></div>
        <button type="button" onClick={onConnect} className="btn-primary shrink-0 text-xs">Connect Kite</button>
      </section>
    )
  }

  const healthy = feedHealth.state === 'live'
  return (
    <section className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${healthy ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`} aria-label="Live market data status">
      <div className="flex items-start gap-3">
        <Radio size={19} className={`mt-0.5 shrink-0 ${healthy ? 'animate-pulse text-emerald-500' : 'text-amber-500'}`} />
        <div><p className="font-black text-ink">{feedHealth.label}</p><p className="mt-1 text-muted">Kite supplies prices only. Playground fills remain inside Strikeview’s ₹10 lakh simulator and cannot reach Zerodha orders.</p></div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-bold text-muted">
        <span className="surface-muted inline-flex items-center gap-1.5 rounded-xl px-3 py-2"><Clock3 size={14} />{lastTickAt ? `Last tick ${new Date(lastTickAt).toLocaleTimeString('en-IN')}` : 'Waiting for first tick'}</span>
        <span className="surface-muted inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-violet-500"><ShieldCheck size={14} />Paper isolated</span>
      </div>
    </section>
  )
}
