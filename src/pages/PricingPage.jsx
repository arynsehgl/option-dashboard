import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PricingPage() {
  const { currentUser, userData, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [hoveredPlan, setHoveredPlan] = useState(null)
  const [processing, setProcessing] = useState(false)

  // Check if user has active access
  const hasActiveAccess = isSuperAdmin || 
    (userData?.isTrialActive && new Date(userData.trialEndDate) > new Date()) ||
    (userData?.subscriptionStatus === 'active' && new Date(userData.subscriptionEndDate) > new Date())

  const plans = [
    {
      id: 'monthly',
      name: 'Monthly',
      price: 299,
      period: 'month',
      features: [
        'Full access to all features',
        'Real-time NSE & BSE data',
        'Advanced analytics & charts',
        'Email support',
        'Auto-renewal after trial',
        'Cancel anytime'
      ]
    },
    {
      id: 'yearly',
      name: 'Yearly',
      price: 3000,
      period: 'year',
      originalPrice: 3588, // 299 * 12
      discount: '16% OFF',
      features: [
        'Everything in Monthly',
        'Premium support',
        'Advanced filters',
        'Export data',
        'Auto-renewal after trial',
        'Save 16% compared to monthly'
      ]
    }
  ]

  async function handleSubscribe(planId) {
    if (!currentUser) {
      navigate('/login')
      return
    }

    setSelectedPlan(planId)
    setProcessing(true)

    try {
      // TODO: Integrate PhonePe payment gateway here
      // For now, we'll create a payment flow
      const plan = plans.find(p => p.id === planId)
      
      // Redirect to PhonePe payment or show payment modal
      // This is a placeholder - you'll need to integrate PhonePe SDK
      console.log('Initiating payment for plan:', plan)
      
      // Simulate payment processing
      // In production, this would:
      // 1. Create a payment order with PhonePe
      // 2. Redirect to PhonePe payment page
      // 3. Handle payment callback
      // 4. Update user subscription in Firestore
      
      alert(`Payment integration needed. Plan: ${plan.name}, Amount: ₹${plan.price}`)
      
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  // Calculate trial days remaining
  const getTrialDaysRemaining = () => {
    if (!userData?.isTrialActive) return 0
    const endDate = new Date(userData.trialEndDate)
    const now = new Date()
    const diff = endDate - now
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-blue-500"
              >
                <circle cx="20" cy="20" r="18" fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="2"/>
                <path
                  d="M20 8 L26 16 L22 16 L22 24 L18 24 L18 16 L14 16 Z"
                  fill="rgba(16, 185, 129, 0.9)"
                  stroke="rgba(16, 185, 129, 1)"
                  strokeWidth="1.5"
                />
                <path
                  d="M20 32 L26 24 L22 24 L22 16 L18 16 L18 24 L14 24 Z"
                  fill="rgba(239, 68, 68, 0.9)"
                  stroke="rgba(239, 68, 68, 1)"
                  strokeWidth="1.5"
                />
                <line x1="12" y1="20" x2="28" y2="20" stroke="rgba(59, 130, 246, 0.6)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                StrikeView
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {currentUser ? (
                <>
                  {hasActiveAccess ? (
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Go to Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/login')}
                      className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                    >
                      Sign Out
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Trial Status Banner */}
      {currentUser && userData?.isTrialActive && (
        <div className="bg-blue-600/20 border-b border-blue-500/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-300 font-medium">
                  🎉 You're on a free trial!
                </p>
                <p className="text-blue-400 text-sm mt-1">
                  {getTrialDaysRemaining()} days remaining. Subscribe now to continue after trial ends.
                </p>
              </div>
              {getTrialDaysRemaining() === 0 && (
                <p className="text-red-400 font-medium">Trial expired</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your Plan
          </h2>
          <p className="text-xl text-slate-400">
            Start with a 3-day free trial. Payment will auto-renew after trial ends unless cancelled.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-slate-800 rounded-xl p-8 border-2 transition-all cursor-pointer ${
                selectedPlan === plan.id || hoveredPlan === plan.id
                  ? 'border-blue-500 shadow-2xl shadow-blue-500/20'
                  : 'border-slate-700'
              }`}
              onClick={() => setSelectedPlan(plan.id)}
              onMouseEnter={() => setHoveredPlan(plan.id)}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              {plan.discount && (
                <div className="absolute -top-2 -right-2">
                  <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    {plan.discount}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">₹{plan.price}</span>
                  <span className="text-slate-400">/{plan.period}</span>
                </div>
                {plan.originalPrice && (
                  <p className="text-slate-500 text-sm mt-1 line-through">
                    ₹{plan.originalPrice}
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSubscribe(plan.id)
                }}
                disabled={processing}
                className="w-full py-3 px-6 rounded-lg font-semibold transition-colors bg-slate-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing && selectedPlan === plan.id
                  ? 'Processing...'
                  : hasActiveAccess
                  ? 'Upgrade Plan'
                  : 'Subscribe Now'}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h3>
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-2">What happens after my trial ends?</h4>
              <p className="text-slate-400">
                After your 3-day free trial, your selected plan will automatically renew and payment will be charged. You can cancel anytime before the trial ends to avoid charges.
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-2">Can I cancel anytime?</h4>
              <p className="text-slate-400">
                Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-2">What payment methods do you accept?</h4>
              <p className="text-slate-400">
                We accept payments through PhonePe, UPI, credit cards, and debit cards.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-slate-400">
            <p>&copy; 2024 StrikeView. All rights reserved.</p>
            <p className="mt-2 text-sm">Built by Aryan Sehgal</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
