/** Stores, applies, and exposes the user's persisted light or dark theme. */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

/**
 * Provides a single persisted light/dark theme across public and authenticated pages.
 */
export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('theme')
    return savedTheme ? savedTheme === 'dark' : true
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    document.body.classList.toggle('dark', isDarkMode)
    window.localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  const value = useMemo(() => ({
    isDarkMode,
    theme: isDarkMode ? 'dark' : 'light',
    toggleTheme: () => setIsDarkMode((current) => !current),
  }), [isDarkMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Returns the global theme controls.
 */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
