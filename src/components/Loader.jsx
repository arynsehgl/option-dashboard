/** Presents the branded startup loader before the dashboard becomes interactive. */
import React, { useState, useEffect } from 'react'
import BrandMark from './BrandMark'

/**
 * Shows a branded glass loading screen on initial page load.
 */
export default function Loader({ onComplete }) {
  const [progress, setProgress] = useState(0)
  const [showLoader, setShowLoader] = useState(true)

  useEffect(() => {
    const duration = 2000 // 2 seconds
    const interval = 100 // Update every 100ms
    const increment = (100 / duration) * interval

    const timer = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + increment
        if (newProgress >= 100) {
          clearInterval(timer)
          setTimeout(() => {
            setShowLoader(false)
            if (onComplete) onComplete()
          }, 300) // Small delay for fade out
          return 100
        }
        return newProgress
      })
    }, interval)

    return () => clearInterval(timer)
  }, [onComplete])

  if (!showLoader) return null

  return (
    <div className="app-background fixed inset-0 z-[90] flex items-center justify-center px-5 transition-opacity duration-300">
      <div className="glass-panel-strong relative z-10 w-full max-w-sm rounded-[2rem] px-8 py-10 text-center">
        <BrandMark className="justify-center" />
        <p className="mb-7 mt-7 text-sm font-semibold text-muted">Preparing your market workspace…</p>
        <div className="mx-auto w-full max-w-64">
          <div className="surface-muted h-2 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 shadow-[0_0_16px_rgba(99,102,241,.55)] transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 text-xs font-extrabold uppercase tracking-[0.16em] text-muted">{Math.round(progress)}%</div>
        </div>
      </div>
    </div>
  )
}
