/** Presents guarded AI research controls and paper-trading report output. */
import React, { useState } from 'react'
import { Bot, BrainCircuit, CheckCircle2, Clock3, FileText, Mail, Play, ShieldX } from 'lucide-react'

/**
 * Displays the guarded AI schedule, research controls, evidence, and daily report.
 */
export default function AIWorkbench({ report, onRun, preview, connected, feedLive }) {
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const canRun = preview || (connected && feedLive)

  /**
   * Starts an isolated paper research run and surfaces its queue acknowledgement.
   */
  async function startResearch() {
    setRunning(true)
    setMessage('')
    try {
      const result = await onRun()
      setMessage(result.message || 'Research run queued successfully.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1fr_21rem]">
        <div className="glass-panel-strong rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Bot className="text-violet-500" /><span className="eyebrow">Trade with AI</span></div><h2 className="mt-3 text-2xl font-black text-ink">Evidence before hypothesis</h2><p className="mt-2 max-w-2xl leading-7 text-muted">The agent can research, explain, and submit structured paper intents. It cannot access the real broker order path.</p></div><button type="button" onClick={startResearch} disabled={running || !canRun} className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"><Play size={16} />{running ? 'Starting…' : canRun ? 'Run research' : 'Live data required'}</button></div>
          {message && <p role="status" className="mt-5 rounded-xl bg-indigo-500/10 p-3 text-sm font-semibold text-indigo-500">{message}</p>}
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ['07:00', 'Research', 'Stored evidence and prior close'],
              ['08:45', 'Connect Kite', 'Daily market-data session'],
              ['09:15', 'Revalidate', 'Live trend, spread, volume'],
              ['15:00', 'Report', 'Plan, decisions, P&L, lessons'],
            ].map(([time, title, copy], index) => <div key={time} className="surface-muted relative rounded-2xl p-4"><span className="text-xs font-black text-indigo-500">{time} IST</span><h3 className="mt-2 font-black text-ink">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{copy}</p>{index < 3 && <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-indigo-400/40 md:block" />}</div>)}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [BrainCircuit, 'LLM judgment', 'Confidence is tracked against outcomes, not presented as certainty.'],
              [ShieldX, 'No broker tool', 'Every intent stops at the deterministic paper risk engine.'],
              [FileText, 'Full audit trail', 'Evidence, revisions, rejected intents, and fills stay visible.'],
            ].map(([Icon, title, copy]) => <div key={title} className="rounded-2xl border border-[var(--glass-border)] p-4"><Icon size={18} className="text-violet-500" /><h3 className="mt-3 text-sm font-black text-ink">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{copy}</p></div>)}
          </div>
        </div>
        <aside className="glass-card rounded-3xl p-5"><div className="flex items-center justify-between"><h3 className="font-black text-ink">Agent status</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${connected && feedLive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{preview ? 'DEMO ONLY' : connected && feedLive ? 'PAPER FEED LIVE' : 'WAITING FOR LIVE DATA'}</span></div><div className="mt-5 space-y-4 text-sm">{[[CheckCircle2, 'Risk engine', 'Ready', 'text-emerald-500'], [Clock3, 'Next research', '07:00 IST', 'text-indigo-500'], [Mail, 'Report delivery', 'In-app; email queue only', 'text-violet-500']].map(([Icon, label, value, color]) => <div key={label} className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl bg-indigo-500/10 ${color}`}><Icon size={17} /></span><div><p className="text-xs text-muted">{label}</p><p className="font-black text-ink">{value}</p></div></div>)}</div></aside>
      </section>

      <section className="glass-panel-strong rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-[var(--glass-border)] pb-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Daily report • {report.date}</p><h2 className="mt-1 text-2xl font-black text-ink">Plan, execution, and outcome</h2></div><span className="rounded-full bg-indigo-500/10 px-3 py-1.5 text-xs font-black text-indigo-500">Confidence {report.confidence}%</span></div>
        <p className="mt-5 leading-7 text-muted">{report.thesis}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Planned', report.plannedTrades], ['Accepted', report.acceptedTrades], ['Rejected', report.rejectedTrades], ['Net P&L', `₹${(report.realisedPnl - report.fees).toLocaleString('en-IN')}`], ['Fees', `₹${report.fees.toLocaleString('en-IN')}`]].map(([label, value]) => <div key={label} className="surface-muted rounded-2xl p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-2 text-lg font-black text-ink">{value}</p></div>)}</div>
        <div className="mt-6"><h3 className="font-black text-ink">What the agent learned</h3><ul className="mt-3 grid gap-3 md:grid-cols-3">{report.lessons.map((lesson) => <li key={lesson} className="rounded-2xl border border-[var(--glass-border)] p-4 text-sm leading-6 text-muted">{lesson}</li>)}</ul></div>
      </section>
    </div>
  )
}
