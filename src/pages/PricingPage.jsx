/** Displays plans and the signed-in user's Firebase-backed entitlement state. */
import React, { useState } from 'react'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageFooter from '../components/PageFooter'
import PublicNav from '../components/PublicNav'
import { parseAccessInstant, profileHasActiveAccess, useAuth } from '../contexts/AuthContext'

const plans = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 299,
    period: 'month',
    description: 'Flexible access for active market research.',
    features: ['Dashboard and Trade Zone', 'NSE and BSE analytics', 'Advanced charts', 'Paper Algo and AI logs', 'In-app daily reports'],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 3000,
    period: 'year',
    originalPrice: 3588,
    badge: 'Save 16%',
    description: 'The best fit for a long-running research workflow.',
    features: ['Everything in Monthly', 'Saved chart workspaces', 'Extended audit history', 'Priority support', 'Lower effective monthly price'],
  },
]

/**
 * Returns positive remaining trial days only while the persisted trial window
 * is actually active; a stale V1 boolean alone never produces an active banner.
 */
export function getActiveTrialDaysRemaining(profile, nowMs = Date.now()) {
  if (profile?.isTrialActive !== true) return 0
  const trialEndMs = parseAccessInstant(profile.trialEndDate)
  if (!Number.isFinite(trialEndMs) || trialEndMs <= nowMs) return 0
  return Math.ceil((trialEndMs - nowMs) / 86400000)
}

/**
 * Renders the redesigned subscription and trial information page.
 */
export default function PricingPage() {
  const { currentUser, userData, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [processing, setProcessing] = useState(false)
  const hasActiveAccess = profileHasActiveAccess(userData, isSuperAdmin)
  const trialDaysRemaining = getActiveTrialDaysRemaining(userData)

  /**
   * Preserves the existing payment placeholder while preventing a false completion state.
   */
  async function handleSubscribe(plan) {
    if (!currentUser) {
      navigate('/login')
      return
    }
    setProcessing(true)
    window.alert(`Payment checkout is not connected yet. Selected: ${plan.name} at ₹${plan.price}/${plan.period}.`)
    setProcessing(false)
  }

  return (
    <div className="app-background min-h-screen text-ink">
      <PublicNav currentUser={currentUser} />
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">Simple access</span>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] text-ink sm:text-6xl">Choose the pace that <span className="brand-gradient">fits your workflow.</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted">Start with three days across both zones. Kite Connect subscriptions and broker charges remain separate.</p>
        </div>

        {currentUser && trialDaysRemaining > 0 && (
          <div className="glass-card mx-auto mt-10 flex max-w-3xl flex-col items-start justify-between gap-4 rounded-2xl border-indigo-400/25 p-5 sm:flex-row sm:items-center">
            <div className="flex gap-3"><Sparkles className="mt-0.5 text-indigo-500" size={20} /><div><p className="font-black text-ink">Your free trial is active</p><p className="mt-1 text-sm text-muted">{trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining under the existing trial rules.</p></div></div>
            {hasActiveAccess && <button type="button" onClick={() => navigate('/zones')} className="btn-secondary text-sm">Open workspace</button>}
          </div>
        )}

        <section className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2" aria-label="Subscription plans">
          {plans.map((plan) => {
            const selected = selectedPlan === plan.id
            return (
              <article key={plan.id} onClick={() => setSelectedPlan(plan.id)} className={`glass-card relative cursor-pointer rounded-[2rem] p-7 transition hover:-translate-y-1 sm:p-8 ${selected ? 'border-indigo-400/55 ring-4 ring-indigo-500/10' : ''}`}>
                {plan.badge && <span className="absolute right-6 top-6 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-extrabold text-emerald-500">{plan.badge}</span>}
                <p className="eyebrow">{plan.name}</p>
                <div className="mt-5 flex items-end gap-2"><span className="text-5xl font-black tracking-[-0.05em] text-ink">₹{plan.price}</span><span className="pb-1 text-muted">/{plan.period}</span></div>
                {plan.originalPrice && <p className="mt-1 text-sm text-muted line-through">₹{plan.originalPrice}</p>}
                <p className="mt-5 leading-7 text-muted">{plan.description}</p>
                <ul className="mt-7 space-y-3">
                  {plan.features.map((feature) => <li key={feature} className="flex items-center gap-3 text-sm font-semibold text-ink"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><Check size={14} /></span>{feature}</li>)}
                </ul>
                <button type="button" onClick={(event) => { event.stopPropagation(); handleSubscribe(plan) }} disabled={processing} className={`${selected ? 'btn-primary' : 'btn-secondary'} mt-8 w-full disabled:opacity-50`}>{processing && selected ? 'Please wait…' : hasActiveAccess ? 'Choose this plan' : 'Continue'}</button>
              </article>
            )
          })}
        </section>

        <section className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            ['What happens after trial?', 'Access pauses when the existing three-day trial expires until a subscription is active.'],
            ['Are broker fees included?', 'No. Zerodha API subscriptions, brokerage, taxes, and exchange charges are separate.'],
            ['Can I cancel?', 'Subscription management will be available when the payment integration is activated.'],
          ].map(([question, answer]) => <article key={question} className="surface-muted rounded-2xl p-5"><ShieldCheck size={18} className="text-indigo-500" /><h2 className="mt-3 font-black text-ink">{question}</h2><p className="mt-2 text-sm leading-6 text-muted">{answer}</p></article>)}
        </section>
      </main>
      <PageFooter />
    </div>
  )
}
