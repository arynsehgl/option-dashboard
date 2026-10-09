/** Restricts authenticated routes while Firebase session state is resolving. */
import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }) {
  const { currentUser, hasActiveAccess, isSuperAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-background min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-muted">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (!hasActiveAccess() && !isSuperAdmin) {
    return <Navigate to="/pricing" replace />
  }

  return children
}
