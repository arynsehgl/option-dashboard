/** Navigates between the Options Lab and Trade Zone experiences. */
import React, { useState } from 'react'
import { BarChart3, CandlestickChart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * Displays the fixed hanging-rope control used to switch between product zones.
 */
export default function ZoneRopeSwitch({ currentZone }) {
  const navigate = useNavigate()
  const [isPulling, setIsPulling] = useState(false)
  const isDashboard = currentZone === 'dashboard'
  const targetLabel = isDashboard ? 'Trade Zone' : 'Dashboard'
  const targetPath = isDashboard ? '/trade-zone' : '/dashboard'
  const TargetIcon = isDashboard ? CandlestickChart : BarChart3

  /**
   * Plays the tactile pull animation before changing zones.
   */
  function handleSwitch() {
    if (isPulling) return
    setIsPulling(true)
    window.setTimeout(() => navigate(targetPath), 250)
  }

  return (
    <div className="pointer-events-none fixed right-3 top-0 z-[80] flex w-[84px] flex-col items-center sm:right-5" data-testid="zone-rope">
      <span className="glass-toolbar h-3 w-7 rounded-b-xl" aria-hidden="true" />
      <span className={`h-11 w-[2px] bg-gradient-to-b from-cyan-300/80 via-indigo-400/70 to-violet-500/50 shadow-[0_0_10px_rgba(99,102,241,.45)] ${isPulling ? 'animate-rope-pull' : ''}`} aria-hidden="true" />
      <button
        type="button"
        onClick={handleSwitch}
        className={`glass-toolbar pointer-events-auto group -mt-0.5 flex min-h-11 min-w-11 flex-col items-center justify-center rounded-2xl px-2.5 py-2 text-ink transition hover:-translate-y-0.5 hover:border-indigo-300/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/30 ${isPulling ? 'animate-rope-pull' : ''}`}
        aria-label={`Switch to ${targetLabel}`}
        title={`Switch to ${targetLabel}`}
      >
        <TargetIcon size={17} className="text-indigo-500" aria-hidden="true" />
        <span className="mt-1 hidden whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[0.12em] sm:block">{targetLabel}</span>
      </button>
    </div>
  )
}
