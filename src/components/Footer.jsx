import React from 'react'

/**
 * Footer Component
 * Displays footer information and links
 */
export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 mt-8 shadow-sm dark:shadow-none">
      <div className="max-w-[98vw] mx-auto px-1 sm:px-2 lg:px-3 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2 mb-3">
              <svg
                width="32"
                height="32"
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
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                StrikeView
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-400 text-center md:text-left">
              Real-time Options Chain Analytics for NSE Indices
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Indices</h3>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map((index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 dark:bg-slate-700 rounded-md text-xs text-gray-700 dark:text-slate-300"
                >
                  {index}
                </span>
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="flex flex-col items-center md:items-end text-center md:text-right">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">About</h3>
            <p className="text-xs text-gray-600 dark:text-slate-400 mb-2">
              Data sourced from NSE & BSE
            </p>
            <p className="text-xs text-gray-600 dark:text-slate-400 mb-2">
              Auto-refresh every 30 seconds
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-4">
              © {currentYear} StrikeView. All rights reserved.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-gray-500 dark:text-slate-500">
            For educational and informational purposes only. Not financial advice.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-500">
            <span>Version 1.0.0</span>
            <span>•</span>
            <span>Built with React & Vite</span>
            <span>•</span>
            <span>Built by Aryan Sehgal</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
