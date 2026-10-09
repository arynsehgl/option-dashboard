/** Handles Firebase email and Google authentication for new and returning users. */
import React, { useState } from 'react'
import { ArrowRight, BarChart3, Bot, Check, Eye, EyeOff, LockKeyhole, Mail, Phone, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'

/**
 * Renders unified sign-in and sign-up flows for the workspace.
 */
export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signup, login, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  /**
   * Authenticates with email credentials and opens the post-login zone lobby.
   */
  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isSignUp) {
        await signup(email, password, name, phone)
        navigate('/pricing')
      } else {
        await login(email, password)
        navigate('/zones')
      }
    } catch (authError) {
      setError(authError.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Starts the configured Google authentication flow.
   */
  async function handleGoogleAuth() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle(isSignUp)
      navigate(isSignUp ? '/pricing' : '/zones')
    } catch (authError) {
      setError(authError.message || 'Google authentication failed. Please try again.')
      setLoading(false)
    }
  }

  /**
   * Switches form modes without carrying a stale error into the new flow.
   */
  function changeMode(nextIsSignUp) {
    setIsSignUp(nextIsSignUp)
    setError('')
  }

  return (
    <div className="app-background min-h-screen text-ink">
      <header className="relative z-20 px-4 pt-4 sm:px-6">
        <div className="glass-toolbar mx-auto flex max-w-7xl items-center justify-between rounded-[1.35rem] px-4 py-3 sm:px-5">
          <Link to="/"><BrandMark /></Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-92px)] max-w-7xl items-center gap-12 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_30rem]">
        <section className="hidden max-w-2xl lg:block">
          <span className="eyebrow">Welcome to your workspace</span>
          <h1 className="mt-4 text-6xl font-black leading-[1.02] tracking-[-0.055em] text-ink">
            Clarity before<br /><span className="brand-gradient">every decision.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">Move naturally from options intelligence to a guarded execution environment—without losing context or control.</p>
          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            {[
              [BarChart3, 'Dashboard', 'Focused options-chain analytics'],
              [Bot, 'Trade Zone', 'Live portfolio and paper-first AI'],
            ].map(([Icon, title, copy]) => (
              <div key={title} className="glass-card rounded-2xl p-5">
                <Icon size={20} className="text-indigo-500" />
                <p className="mt-3 font-black">{title}</p>
                <p className="mt-1 text-sm text-muted">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel-strong mx-auto w-full max-w-md rounded-[2rem] p-6 sm:p-8" aria-labelledby="auth-title">
          <div>
            <span className="eyebrow">{isSignUp ? 'Start your trial' : 'Secure sign in'}</span>
            <h2 id="auth-title" className="mt-2 text-3xl font-black tracking-[-0.035em] text-ink">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{isSignUp ? 'Three days to explore both zones.' : 'Continue to your Stride zone lobby.'}</p>
          </div>

          <div className="surface-muted mt-6 grid grid-cols-2 rounded-xl p-1" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={!isSignUp} onClick={() => changeMode(false)} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${!isSignUp ? 'bg-indigo-600 text-white shadow-lg' : 'text-muted hover:text-ink'}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={isSignUp} onClick={() => changeMode(true)} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${isSignUp ? 'bg-indigo-600 text-white shadow-lg' : 'text-muted hover:text-ink'}`}>Sign up</button>
          </div>

          {error && <div role="alert" className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-medium text-rose-500">{error}</div>}

          <button type="button" onClick={handleGoogleAuth} disabled={loading} className="btn-secondary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.56c2.09-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.08H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.82 6.08L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.13em] text-muted"><span className="h-px flex-1 bg-[var(--glass-border)]" />or email<span className="h-px flex-1 bg-[var(--glass-border)]" /></div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <label className="block text-sm font-bold text-ink">Full name<div className="relative mt-2"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input className="form-control pl-10" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Your name" autoComplete="name" /></div></label>
                <label className="block text-sm font-bold text-ink">Phone number<div className="relative mt-2"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input className="form-control pl-10" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={32} placeholder="+91 98765 43210" autoComplete="tel" /></div></label>
              </>
            )}
            <label className="block text-sm font-bold text-ink">Email<div className="relative mt-2"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input type="email" className="form-control pl-10" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" autoComplete="email" /></div></label>
            <label className="block text-sm font-bold text-ink">Password<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input type={showPassword ? 'text' : 'password'} className="form-control px-10" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="At least 6 characters" autoComplete={isSignUp ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {!isSignUp && <div className="text-right"><Link to="/forgot-password" className="text-sm font-bold text-indigo-500 hover:text-indigo-400">Forgot password?</Link></div>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Enter workspace'}{!loading && <ArrowRight size={17} />}</button>
          </form>

          {isSignUp && <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted"><Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />By continuing, you acknowledge that market data and trading tools do not guarantee returns.</p>}
        </section>
      </main>
    </div>
  )
}
