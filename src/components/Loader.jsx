import React, { useState, useEffect } from 'react'

/**
 * Initial Page Loader Component
 * Shows a loading screen for 2 seconds on initial page load
 */
export default function Loader({ onComplete, isDarkMode = true }) {
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
      isDarkMode ? 'bg-slate-900' : 'bg-gray-50'
    }`}>
      <div className="text-center">
        {/* Logo Animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <svg
              width="80"
              height="80"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-blue-500 animate-pulse"
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
          </div>
        </div>

        {/* App Name */}
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          StrikeView
        </h1>

        {/* Loading Text */}
        <p className={`mb-6 text-lg ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Loading Options Chain Data...</p>

        {/* Progress Bar */}
        <div className="w-64 mx-auto">
          <div className={`h-2 rounded-full overflow-hidden ${
            isDarkMode ? 'bg-slate-700' : 'bg-gray-200'
          }`}>
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`mt-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>{Math.round(progress)}%</div>
        </div>
      </div>
    </div>
  )
}
