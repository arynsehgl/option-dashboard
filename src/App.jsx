/** Defines lazy-loaded public, authenticated dashboard, and Trade Zone routes. */
import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'

const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ZoneLobby = lazy(() => import('./pages/ZoneLobby'))
const TradeZone = lazy(() => import('./pages/TradeZone'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))

/**
 * Displays a neutral branded loading state while a route bundle is fetched.
 */
function RouteFallback() {
  return <div className="app-background grid min-h-screen place-items-center"><div className="glass-panel-strong relative z-10 rounded-3xl px-9 py-7 text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-500" /><p className="mt-3 text-sm font-bold text-muted">Opening Stride…</p></div></div>
}

/**
 * Composes global providers and lazily loaded public and protected routes.
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/zones" element={<ProtectedRoute><ZoneLobby /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/trade-zone" element={<ProtectedRoute><TradeZone /></ProtectedRoute>} />
                <Route path="/trade-zone/:section" element={<ProtectedRoute><TradeZone /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
