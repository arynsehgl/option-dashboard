/** Presents the public Stride product overview and entry points. */
import React from 'react'
import { ArrowRight, BarChart3, Bot, CandlestickChart, Check, Layers3, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageFooter from '../components/PageFooter'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../contexts/AuthContext'

const features = [
  {
    icon: BarChart3,
    title: 'Options intelligence',
    copy: 'NSE and BSE option chains, OI shifts, PCR, Max Pain, dominance, and focused visual analytics.',
  },
  {
    icon: CandlestickChart,
    title: 'A complete trade view',
    copy: 'Portfolio, P&L, search, watchlists, charts, and reviewed Kite orders inside one calm workspace.',
  },
  {
    icon: Bot,
    title: 'AI with hard boundaries',
    copy: 'Evidence-led research and intraday paper trading, separated from the real broker execution path.',
  },
]

/**
 * Renders the redesigned public landing page for both Stride product zones.
 */
export default function HomePage() {
  const { currentUser } = useAuth()

  return (
    <div className="app-background min-h-screen text-ink">
      <PublicNav currentUser={currentUser} />

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-20 sm:px-6 lg:grid-cols-[1.04fr_.96fr] lg:pb-28 lg:pt-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-500">
              <Sparkles size={14} /> One workspace. Two focused zones.
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[1.02] tracking-[-0.055em] text-ink sm:text-6xl lg:text-7xl">
              See the market.<br /><span className="brand-gradient">Move with clarity.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              Stride brings options analytics and a guarded trading workspace together without mixing their jobs. Explore structure in Dashboard, then move to Trade Zone when you are ready to act.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={currentUser ? '/zones' : '/login'} className="btn-primary px-6 py-3.5">
                {currentUser ? 'Open your workspace' : 'Start your 3-day trial'} <ArrowRight size={18} />
              </Link>
              <Link to="/pricing" className="btn-secondary px-6 py-3.5">View pricing</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {['NSE + BSE analytics', 'Kite-ready architecture', 'Paper-first automation'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2"><Check size={15} className="text-emerald-500" />{item}</span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute inset-8 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="glass-panel relative overflow-hidden rounded-[2rem] p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Market pulse</p>
                  <p className="mt-1 text-lg font-black text-ink">Your morning cockpit</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live feed ready
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ['NIFTY 50', '24,742.30', '+0.74%'],
                  ['BANKNIFTY', '54,126.85', '+0.41%'],
                  ['Day P&L', '₹12,480', '+1.26%'],
                  ['AI risk used', '0.5%', 'Within limits'],
                ].map(([label, value, change]) => (
                  <div key={label} className="surface-muted rounded-2xl p-4">
                    <p className="text-xs font-semibold text-muted">{label}</p>
                    <p className="mt-2 text-xl font-black text-ink">{value}</p>
                    <p className="mt-1 text-xs font-bold text-emerald-500">{change}</p>
                  </div>
                ))}
              </div>
              <div className="surface-muted mt-3 rounded-2xl p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted">NIFTY • 15m</p>
                    <p className="mt-1 text-sm font-bold text-ink">Momentum holding above VWAP</p>
                  </div>
                  <Zap size={18} className="text-indigo-500" />
                </div>
                <svg viewBox="0 0 480 120" className="mt-4 h-28 w-full" role="img" aria-label="Illustrative rising price chart">
                  <defs>
                    <linearGradient id="home-chart" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#6366f1" stopOpacity="0.38" />
                      <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 96C40 91 57 76 91 81c35 5 54-26 90-18 36 8 54-4 84-19 30-15 55 3 83-7 34-12 59-29 132-24v107H0Z" fill="url(#home-chart)" />
                  <path d="M0 96C40 91 57 76 91 81c35 5 54-26 90-18 36 8 54-4 84-19 30-15 55 3 83-7 34-12 59-29 132-24" fill="none" stroke="#777cf8" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <span className="eyebrow">Designed around the decision</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink sm:text-5xl">Power where you need it. Guardrails where they matter.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {features.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="glass-card rounded-3xl p-7">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-500"><Icon size={23} /></div>
                <h3 className="mt-6 text-xl font-black text-ink">{title}</h3>
                <p className="mt-3 leading-7 text-muted">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="glass-panel relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <span className="eyebrow">Paper first, always explainable</span>
                <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.04em] text-ink sm:text-5xl">Train strategies against live conditions before real capital is even an option.</h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">Every AI hypothesis, rejected intent, simulated fill, and daily outcome stays visible in one audit trail.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div className="surface-muted rounded-2xl p-4"><ShieldCheck className="text-emerald-500" /><p className="mt-2 font-bold">Hard risk engine</p></div>
                <div className="surface-muted rounded-2xl p-4"><Layers3 className="text-violet-500" /><p className="mt-2 font-bold">Versioned plans</p></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PageFooter />
    </div>
  )
}
