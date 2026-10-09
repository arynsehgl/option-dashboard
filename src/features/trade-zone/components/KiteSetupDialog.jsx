/** Collects broker connection details without persisting secrets in the browser. */
import React, { useState } from 'react'
import { KeyRound, LockKeyhole, X } from 'lucide-react'

/**
 * Collects personal Kite app credentials once and sends them to encrypted server storage.
 */
export default function KiteSetupDialog({ onClose, onSave }) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /**
   * Stores credentials and immediately advances into the official Kite login redirect.
   */
  async function submitCredentials(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ apiKey, apiSecret })
    } catch (saveError) {
      setError(saveError.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="kite-setup-title">
      <form onSubmit={submitCredentials} className="glass-panel-strong w-full max-w-lg rounded-3xl p-6">
        <div className="flex items-start justify-between"><div><p className="eyebrow">Personal broker connection</p><h2 id="kite-setup-title" className="mt-2 text-2xl font-black text-ink">Connect your Kite app</h2></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-rose-500/10 hover:text-rose-500" aria-label="Close Kite setup"><X size={18} /></button></div>
        <p className="mt-4 text-sm leading-6 text-muted">Use the API key and secret issued in the Kite developer console. They go directly to the worker, are encrypted with AES-256-GCM, and are never returned to this browser.</p>
        <p className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs font-semibold leading-5 text-violet-600 dark:text-violet-300">In Playground, this connection supplies market data only. Its AI and Algo services do not receive Kite order capabilities.</p>
        <div className="mt-5 space-y-4"><label className="block text-sm font-bold text-ink">API key<div className="relative mt-2"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input required minLength={3} autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="form-control pl-10" /></div></label><label className="block text-sm font-bold text-ink">API secret<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input required minLength={8} type="password" autoComplete="new-password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} className="form-control pl-10" /></div></label></div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !apiKey || !apiSecret} className="btn-primary disabled:opacity-50">{saving ? 'Encrypting…' : 'Save and continue to Kite'}</button></div>
      </form>
    </div>
  )
}
