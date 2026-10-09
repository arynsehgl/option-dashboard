/** Renders the authenticated dashboard footer and supporting links. */
import React from 'react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'

/**
 * Displays the compact Dashboard footer and market-data disclaimer.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 mt-8 border-t border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[98vw] flex-col items-center justify-between gap-5 px-3 py-6 text-center sm:flex-row sm:text-left">
        <BrandMark />
        <div className="text-xs leading-5 text-muted">
          <p>Data sourced from NSE & BSE • Auto-refresh every 30 seconds</p>
          <p>For educational and informational purposes only. Not financial advice.</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-muted"><Link to="/zones" className="hover:text-ink">Zones</Link><span>•</span><Link to="/pricing" className="hover:text-ink">Pricing</Link><span>•</span><span>© {new Date().getFullYear()}</span></div>
      </div>
    </footer>
  )
}
