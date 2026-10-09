/**
 * Post-login launcher for options analytics and the release-guarded Trade Zone.
 * @module pages/ZoneLobby
 */

import React from 'react'
import { ArrowRight, BarChart3, Bot, CandlestickChart, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'

const zones = [
  {
    id: 'dashboard',
    path: '/dashboard',
    eyebrow: 'Options analytics',
    title: 'Dashboard',
    description: 'Read market structure through live NSE and BSE options chains, OI, PCR, Max Pain, and visual analytics.',
    icon: BarChart3,
    accent: 'from-cyan-400 to-indigo-500',
    stats: ['NSE + BSE', '30s refresh', 'Options intelligence'],
  },
  {
    id: 'trade-zone',
    path: '/trade-zone',
    eyebrow: 'Broker workspace',
    title: 'Trade Zone',
    description: 'Connect Kite for read-only portfolio views, draft-only Algo ideas, and guarded paper AI research without manual order entry.',
    icon: CandlestickChart,
    accent: 'from-violet-400 to-fuchsia-500',
    stats: ['Read-only live', 'No manual orders', 'Guarded paper AI'],
  },
]

/**
 * Presents the post-login decision point between the independent product zones.
 */
export default function ZoneLobby() {
  const { currentUser, userData, logout } = useAuth()
  const navigate = useNavigate()
  const displayName = userData?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Trader'

  /**
   * Signs the active user out and returns to the public home page.
   */
  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="app-background min-h-screen text-ink">
      <header className="relative z-30 px-4 pt-4 sm:px-6">
        <div className="glass-toolbar mx-auto flex max-w-7xl items-center justify-between rounded-[1.35rem] px-4 py-3 sm:px-5">
          <Link to="/"><BrandMark /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button type="button" onClick={handleLogout} className="btn-secondary text-sm" title="Sign out">
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">Your market workspace</span>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] text-ink sm:text-6xl">
            Welcome back, <span className="brand-gradient">{displayName}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            Choose how you want to read or act on the market. Each zone keeps its own context, so analytics never gets tangled with execution.
          </p>
        </div>

        <section className="mt-12 grid gap-6 lg:grid-cols-2" aria-label="Workspace zones">
          {zones.map((zone) => {
            const Icon = zone.icon
            return (
              <Link
                key={zone.id}
                to={zone.path}
                className="glass-card group relative overflow-hidden rounded-[2rem] p-7 transition duration-300 hover:-translate-y-1 hover:border-indigo-400/35 sm:p-9"
              >
                <div className={`absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br ${zone.accent} opacity-10 blur-3xl transition group-hover:opacity-20`} />
                <div className="relative">
                  <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${zone.accent} text-white shadow-xl`}>
                    <Icon size={27} />
                  </div>
                  <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.18em] text-muted">{zone.eyebrow}</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-ink">{zone.title}</h2>
                  <p className="mt-4 min-h-[4.5rem] leading-7 text-muted">{zone.description}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {zone.stats.map((stat) => (
                      <span key={stat} className="surface-muted rounded-full px-3 py-1.5 text-xs font-bold text-muted">{stat}</span>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center justify-between border-t border-[var(--glass-border)] pt-6">
                    <span className="font-bold text-ink">Enter {zone.title}</span>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-500/10 text-indigo-500 transition group-hover:translate-x-1 group-hover:bg-indigo-500 group-hover:text-white">
                      <ArrowRight size={19} />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            [ShieldCheck, 'Isolated by design', 'Broker credentials, portfolios, and logs stay user-specific.'],
            [Bot, 'Guarded automation', 'Only open revalidation may create paper intents; Algo strategies remain drafts and previews.'],
            [Sparkles, 'One calm interface', 'Consistent navigation, status, and safeguards across both zones.'],
          ].map(([Icon, title, copy]) => (
            <div key={title} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
              <Icon size={19} className="text-indigo-500" />
              <h3 className="mt-3 font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
