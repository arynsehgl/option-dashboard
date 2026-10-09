/** Provides an accessible control for switching the shared color theme. */
import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

/**
 * Provides an accessible global theme toggle.
 */
export default function ThemeToggle({ className = '' }) {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`glass-toolbar grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:-translate-y-0.5 hover:text-ink ${className}`}
      aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
    >
      {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
