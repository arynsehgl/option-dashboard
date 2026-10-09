/**
 * Provides the V2 paper-strategy drafting surface without exposing incomplete
 * automated entry or exit execution.
 */
import React, { useEffect, useState } from 'react'
import { Braces, Clock3, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'

const emptyRule = { field: 'price', operator: 'crosses_above', value: 'VWAP' }

/**
 * Provides a paper-only visual strategy builder with versionable rule output.
 */
export default function AlgoBuilder({ onSave, instruments = [] }) {
  const [name, setName] = useState('VWAP momentum confirmation')
  const [instrumentKey, setInstrumentKey] = useState(instruments[0]?.instrumentKey || '')
  const [rules, setRules] = useState([
    { field: 'price', operator: 'crosses_above', value: 'VWAP' },
    { field: 'volume', operator: 'greater_than', value: '1.5x average' },
  ])
  const [quantity, setQuantity] = useState(1)
  const [side, setSide] = useState('BUY')
  const [stopLoss, setStopLoss] = useState(0.5)
  const [target, setTarget] = useState(1)
  const [feedback, setFeedback] = useState('')
  const [strategyId, setStrategyId] = useState(null)

  useEffect(() => {
    if (!instrumentKey && instruments[0]) setInstrumentKey(instruments[0].instrumentKey)
  }, [instrumentKey, instruments])

  /**
   * Replaces one field in a strategy rule without mutating the existing list.
   */
  function updateRule(index, key, value) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [key]: value } : rule))
  }

  /**
   * Validates and persists a new immutable draft strategy version.
   */
  async function saveStrategy() {
    const strategy = {
      name,
      ...(strategyId ? { strategyId } : {}),
      instrumentKey,
      environment: 'paper',
      holdingPeriod: 'intraday',
      rules,
      action: { side, quantity: Number(quantity), stopLossPercent: Number(stopLoss), targetPercent: Number(target) },
      schedule: { start: '09:15', stopEntries: '15:19', flatten: '15:19', timezone: 'Asia/Kolkata' },
      activate: false,
    }
    try {
      const saved = await onSave(strategy)
      setStrategyId(saved.id || strategyId)
      setFeedback(`Saved “${saved.name}” as an inactive strategy draft.`)
    } catch (error) {
      setFeedback(error.message)
    }
  }

  /**
   * Renders the declarative rule set as a human-readable paper execution statement.
   */
  function previewLogic() {
    const conditions = rules.map((rule) => `${rule.field} ${rule.operator.replaceAll('_', ' ')} ${rule.value}`).join(' AND ')
    setFeedback(`Draft preview: ${side} ${quantity} of ${instrumentKey || 'the selected instrument'} when ${conditions || 'no conditions are configured'}; stop ${stopLoss}% and target ${target}% are planning references only.`)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
      <section className="glass-panel-strong rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-[var(--glass-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="eyebrow">Visual rule builder</p><h2 className="mt-1 text-2xl font-black text-ink">Paper Algo strategy</h2></div>
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-violet-500/10 px-3 py-1.5 text-xs font-black text-violet-500"><ShieldCheck size={15} />Paper only</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-ink">Strategy name<input className="form-control mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm font-bold text-ink">Instrument<select className="form-control mt-2" value={instrumentKey} onChange={(event) => setInstrumentKey(event.target.value)}><option value="">Select from watchlist</option>{instruments.map((instrument) => <option key={instrument.instrumentKey} value={instrument.instrumentKey}>{instrument.exchange}:{instrument.symbol}</option>)}</select></label></div>

        <div className="mt-6">
          <div className="flex items-center justify-between"><h3 className="font-black text-ink">Entry conditions</h3><button type="button" onClick={() => setRules((current) => [...current, { ...emptyRule }])} className="btn-secondary px-3 py-2 text-xs"><Plus size={15} />Add condition</button></div>
          <div className="mt-3 space-y-3">
            {rules.map((rule, index) => (
              <div key={`${index}-${rule.field}`} className="surface-muted grid gap-2 rounded-2xl p-3 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
                <select className="form-control py-2 text-sm" value={rule.field} onChange={(event) => updateRule(index, 'field', event.target.value)}><option value="price">Price</option><option value="volume">Volume</option><option value="rsi">RSI</option><option value="ema">EMA</option><option value="time">Time</option></select>
                <select className="form-control py-2 text-sm" value={rule.operator} onChange={(event) => updateRule(index, 'operator', event.target.value)}><option value="crosses_above">crosses above</option><option value="crosses_below">crosses below</option><option value="greater_than">is greater than</option><option value="less_than">is less than</option><option value="equals">equals</option></select>
                <input className="form-control py-2 text-sm" value={rule.value} onChange={(event) => updateRule(index, 'value', event.target.value)} />
                <button type="button" onClick={() => setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-rose-500/10 hover:text-rose-500" aria-label={`Delete condition ${index + 1}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-bold text-muted">Side<select className="form-control mt-2" value={side} onChange={(event) => setSide(event.target.value)}><option>BUY</option><option>SELL</option></select></label>
          <label className="text-xs font-bold text-muted">Quantity<input type="number" min="1" className="form-control mt-2" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="text-xs font-bold text-muted">Stop loss %<input type="number" min="0.1" max="1" step="0.1" className="form-control mt-2" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /></label>
          <label className="text-xs font-bold text-muted">Target %<input type="number" min="0.1" step="0.1" className="form-control mt-2" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
        </div>

        {feedback && <p role="status" className="mt-4 rounded-xl bg-indigo-500/10 p-3 text-sm font-semibold text-indigo-500">{feedback}</p>}
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm font-semibold text-amber-600 dark:text-amber-300">Draft and preview only in V2. Stop-loss and target values do not trigger automated exits, so strategy activation remains disabled until exit guards are released.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={previewLogic} className="btn-secondary"><Braces size={16} />Preview logic</button><button type="button" onClick={saveStrategy} disabled={!name || !instrumentKey || !rules.length} className="btn-secondary disabled:opacity-45"><Save size={16} />Save draft</button><button type="button" disabled className="btn-primary cursor-not-allowed opacity-45"><ShieldCheck size={16} />Activation unavailable</button></div>
      </section>

      <aside className="space-y-4">
        <div className="glass-card rounded-3xl p-5"><Clock3 className="text-indigo-500" /><h3 className="mt-4 font-black text-ink">Planned lifecycle</h3><p className="mt-2 text-xs font-semibold text-amber-500">Preview only; no scheduler is activated from this screen.</p><ol className="mt-4 space-y-4 text-sm">{[['09:15', 'Conditions would become eligible'], ['15:19', 'New entries would stop'], ['15:19', 'Open paper positions would flatten']].map(([time, text]) => <li key={`${time}-${text}`} className="flex gap-3"><span className="font-black text-indigo-500">{time}</span><span className="text-muted">{text}</span></li>)}</ol></div>
        <div className="glass-card rounded-3xl p-5"><ShieldCheck className="text-emerald-500" /><h3 className="mt-4 font-black text-ink">Risk envelope</h3><ul className="mt-3 space-y-2 text-sm text-muted"><li>0.5% risk per trade</li><li>2% daily loss stop</li><li>Maximum 5 positions</li><li>100% utilisation ceiling</li></ul></div>
      </aside>
    </div>
  )
}
