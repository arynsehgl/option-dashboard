/** Renders searchable instruments and controls the active market selection. */
import React, { useMemo, useState } from 'react'
import { Check, LoaderCircle, Plus, Search, Star } from 'lucide-react'

/**
 * Renders searchable instruments and lets the user select the active chart context.
 */
export default function Watchlist({ instruments, selectedKey, onSelect, onSearch, onAdd }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const filtered = useMemo(() => instruments.filter((instrument) =>
    `${instrument.symbol} ${instrument.exchange}`.toLowerCase().includes(query.toLowerCase())), [instruments, query])

  /**
   * Searches the complete broker instrument master when local filtering is insufficient.
   */
  async function handleSearch(event) {
    event?.preventDefault()
    if (!onSearch || query.trim().length < 2) return
    setSearching(true)
    setMessage('')
    try {
      setResults(await onSearch(query))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSearching(false)
    }
  }

  /**
   * Persists one search result and reports completion in place.
   */
  async function handleAdd(instrument) {
    if (!onAdd) return
    setMessage('')
    try {
      await onAdd(instrument.instrumentKey)
      setMessage(`${instrument.symbol} added`)
      setResults((current) => current.filter((item) => item.instrumentKey !== instrument.instrumentKey))
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <aside className="glass-panel-strong overflow-hidden rounded-3xl">
      <div className="border-b border-[var(--glass-border)] p-4">
        <div className="flex items-center justify-between"><h2 className="font-black text-ink">Watchlist</h2>{message && <span className="max-w-32 truncate text-[10px] font-bold text-emerald-500" title={message}><Check size={11} className="mr-1 inline" />{message}</span>}</div>
        <form onSubmit={handleSearch} className="relative mt-3 flex gap-2"><label className="relative block min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><span className="sr-only">Search instruments</span><input value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setMessage('') }} className="form-control py-2 pl-9 text-sm" placeholder="Company or symbol" /></label><button type="submit" disabled={!onSearch || query.trim().length < 2 || searching} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40" title="Search all instruments">{searching ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}</button></form>
      </div>
      {results.length > 0 && <div className="border-b border-[var(--glass-border)] bg-indigo-500/5 p-2"><p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wider text-muted">Instrument search</p>{results.slice(0, 8).map((instrument) => <button key={instrument.instrumentKey} type="button" onClick={() => handleAdd(instrument)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-indigo-500/10"><span className="min-w-0"><span className="block truncate text-xs font-black text-ink">{instrument.symbol}</span><span className="block truncate text-[10px] text-muted">{instrument.exchange} · {instrument.name || instrument.instrumentType}</span></span><Plus size={14} className="shrink-0 text-indigo-500" /></button>)}</div>}
      <div className="max-h-[520px] overflow-y-auto p-2">
        {filtered.map((instrument) => (
          <button key={instrument.instrumentKey} type="button" onClick={() => onSelect(instrument)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selectedKey === instrument.instrumentKey ? 'bg-indigo-500/10 ring-1 ring-indigo-400/25' : 'hover:bg-indigo-500/10'}`}>
            <div className="min-w-0"><div className="flex items-center gap-1.5"><span className="truncate text-sm font-black text-ink">{instrument.symbol}</span>{selectedKey === instrument.instrumentKey && <Star size={12} className="fill-indigo-500 text-indigo-500" />}</div><span className="text-[10px] font-bold text-muted">{instrument.exchange}</span></div>
            <div className="ml-3 text-right"><p className={`text-sm font-black transition-colors ${instrument.direction === 'up' ? 'text-emerald-500' : instrument.direction === 'down' ? 'text-rose-500' : 'text-ink'}`}>{instrument.price.toLocaleString('en-IN')}</p><p className={`text-[11px] font-bold ${instrument.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{instrument.change >= 0 ? '+' : ''}{instrument.change}%</p></div>
          </button>
        ))}
        {!filtered.length && <p className="p-6 text-center text-sm text-muted">No matching instruments</p>}
      </div>
    </aside>
  )
}
