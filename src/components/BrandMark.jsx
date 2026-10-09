/** Renders the reusable Strikeview brand mark in compact and full layouts. */
import React, { useId } from 'react'

/**
 * Renders the Strikeview moving-path monogram and optional wordmark.
 */
export default function BrandMark({ compact = false, className = '' }) {
  const gradientId = useId().replace(/:/g, '')

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <span className="brand-glyph" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
          <path
            d="M12 37h14.2c5.5 0 9.3-2.7 9.3-7 0-4.1-3.4-6.7-8.7-6.7h-6.1c-5.2 0-8.7-2.8-8.7-7.1 0-4.4 3.8-7.2 9.2-7.2H36"
            stroke={`url(#${gradientId})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="m31.5 4.8 5 4.2-5 4.2" stroke="#72E6FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.5 34.6h13" stroke="white" strokeOpacity="0.46" strokeWidth="1.4" strokeLinecap="round" />
          <defs>
            <linearGradient id={gradientId} x1="11" y1="38" x2="38" y2="7" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A855F7" />
              <stop offset="0.48" stopColor="#6574FF" />
              <stop offset="1" stopColor="#4DE4F7" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      {!compact && (
        <span>
          <span className="block text-xl font-black tracking-[-0.045em] text-ink">Strikeview</span>
          <span className="block text-[8px] font-extrabold uppercase tracking-[0.27em] text-muted">Move with clarity</span>
        </span>
      )}
    </div>
  )
}
