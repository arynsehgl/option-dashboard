import React, { useEffect, useState, useCallback } from 'react'

/**
 * Notification Component
 * Displays alerts for key metric changes
 */
export default function Notifications({ notifications, onDismiss }) {
  const [visibleNotifications, setVisibleNotifications] = useState([])

  useEffect(() => {
    if (notifications.length > 0) {
      // Add new notifications
      setVisibleNotifications((prev) => {
        // Filter out duplicates
        const existingIds = new Set(prev.map((n) => n.id))
        const newOnes = notifications.filter((n) => !existingIds.has(n.id))
        return [...prev, ...newOnes]
      })
    }
  }, [notifications])

  const handleDismiss = useCallback((id) => {
    setVisibleNotifications((prev) => prev.filter((n) => n.id !== id))
    if (onDismiss) onDismiss(id)
  }, [onDismiss])

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timers = visibleNotifications.map((notification) => {
      return setTimeout(() => {
        handleDismiss(notification.id)
      }, 5000)
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [visibleNotifications, handleDismiss])

  if (visibleNotifications.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md">
      {visibleNotifications.map((notification) => {
        const bgColor =
          notification.type === 'warning'
            ? 'bg-yellow-900/90 border-yellow-500'
            : notification.type === 'error'
            ? 'bg-red-900/90 border-red-500'
            : 'bg-blue-900/90 border-blue-500'

        const iconColor =
          notification.type === 'warning'
            ? 'text-yellow-400'
            : notification.type === 'error'
            ? 'text-red-400'
            : 'text-blue-400'

        return (
          <div
            key={notification.id}
            className={`${bgColor} border-l-4 rounded-lg shadow-lg p-4 text-white animate-slide-in-right`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                {/* Icon */}
                <div className={`${iconColor} mt-0.5`}>
                  {notification.type === 'warning' ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  ) : notification.type === 'error' ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1">
                    {notification.title}
                  </div>
                  <div className="text-xs text-slate-300">
                    {notification.message}
                  </div>
                  {notification.value && (
                    <div className="text-xs font-mono mt-1 text-slate-200">
                      {notification.value}
                    </div>
                  )}
                </div>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => handleDismiss(notification.id)}
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

