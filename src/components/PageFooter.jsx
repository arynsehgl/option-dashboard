/** Renders the shared public-page footer for the Stride experience. */
import React from 'react'
import BrandMark from './BrandMark'

/**
 * Renders the unified public footer for the redesigned experience.
 */
export default function PageFooter() {
  return (
    <footer className="relative z-10 px-4 pb-6 pt-16 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 border-t border-[var(--glass-border)] pt-6 text-sm text-muted sm:flex-row">
        <BrandMark />
        <p>Analytics and execution tools for informed decisions. Trading involves risk.</p>
        <p>© {new Date().getFullYear()} Stride</p>
      </div>
    </footer>
  )
}
