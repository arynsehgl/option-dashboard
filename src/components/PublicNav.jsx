/** Renders responsive public navigation with session-aware actions. */
import React from 'react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import ThemeToggle from './ThemeToggle'

/**
 * Renders the common navigation used by public Strikeview pages.
 */
export default function PublicNav({ currentUser }) {
  return (
    <header className="relative z-30 px-4 pt-4 sm:px-6">
      <nav className="glass-toolbar mx-auto flex max-w-7xl items-center justify-between rounded-[1.35rem] px-4 py-3 sm:px-5" aria-label="Primary navigation">
        <Link to="/" aria-label="Strikeview home"><BrandMark /></Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/pricing" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-ink sm:block">Pricing</Link>
          <ThemeToggle />
          <Link to={currentUser ? '/zones' : '/login'} className="btn-primary text-sm">
            {currentUser ? 'Open workspace' : 'Sign in'}
          </Link>
        </div>
      </nav>
    </header>
  )
}
