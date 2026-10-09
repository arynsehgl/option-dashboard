/** Provides Firebase password-reset requests from the public authentication flow. */
import React, { useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'

/**
 * Provides the Firebase password recovery flow used by existing V1 accounts.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { resetPassword } = useAuth()

  /**
   * Requests a recovery email through the configured authentication provider.
   */
  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      await resetPassword(email)
      setMessage('If an account exists for this email, a recovery link has been sent.')
    } catch (recoveryError) {
      setError(recoveryError.message || 'Unable to send a recovery link right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-background min-h-screen text-ink">
      <header className="relative z-20 px-4 pt-4 sm:px-6"><div className="glass-toolbar mx-auto flex max-w-7xl items-center justify-between rounded-[1.35rem] px-4 py-3 sm:px-5"><Link to="/"><BrandMark /></Link><ThemeToggle /></div></header>
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-92px)] max-w-lg items-center px-4 pb-20">
        <section className="glass-panel-strong w-full rounded-[2rem] p-7 sm:p-9">
          <span className="eyebrow">Account recovery</span>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-ink">Reset your password</h1>
          <p className="mt-3 leading-7 text-muted">Enter the email used for Strikeview. We will send the provider’s secure recovery link.</p>
          {message && <div role="status" className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-500">{message}</div>}
          {error && <div role="alert" className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-500">{error}</div>}
          <form onSubmit={handleSubmit} className="mt-6">
            <label className="block text-sm font-bold text-ink">Email<div className="relative mt-2"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input className="form-control pl-10" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" /></div></label>
            <button type="submit" disabled={loading} className="btn-primary mt-5 w-full disabled:opacity-50">{loading ? 'Sending…' : 'Send recovery link'}</button>
          </form>
          <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-500"><ArrowLeft size={16} />Back to sign in</Link>
        </section>
      </main>
    </div>
  )
}
