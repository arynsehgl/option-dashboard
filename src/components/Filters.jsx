import React, { useState } from 'react'

/**
 * Filters Panel Component
 * Strike range, expiry date, and high OI filter
 */
export default function Filters({ 
  strikeRange, 
  onStrikeRangeChange, 
  expiryDate, 
  onExpiryDateChange,
  expiryDates = [],
  showHighOI,
  onShowHighOIChange,
  showLotMultiplier,
  onShowLotMultiplierChange
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 shadow-sm dark:shadow-none">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">FILTERS</h2>
      
      <div className="space-y-6">
        {/* Strike Range */}
        <div>
          <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
            Number of Strikes: {strikeRange} (ATM centered)
          </label>
          <input
            type="range"
            min="3"
            max="20"
            value={strikeRange}
            onChange={(e) => onStrikeRangeChange(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between items-center mt-1">
            {/* Left side: - button and 3 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newValue = Math.max(3, strikeRange - 1)
                  onStrikeRangeChange(newValue)
                }}
                disabled={strikeRange <= 3}
                className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-white rounded border border-gray-300 dark:border-slate-600 transition-colors text-sm font-bold"
                title="Decrease by 1"
              >
                −
              </button>
              <span className="text-xs text-gray-500 dark:text-slate-400">3</span>
            </div>
            
            {/* Right side: 20 and + button */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-slate-400">20</span>
              <button
                onClick={() => {
                  const newValue = Math.min(20, strikeRange + 1)
                  onStrikeRangeChange(newValue)
                }}
                disabled={strikeRange >= 20}
                className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-white rounded border border-gray-300 dark:border-slate-600 transition-colors text-sm font-bold"
                title="Increase by 1"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Expiry Date */}
        <div>
          <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">Expiry Date</label>
          <select
            value={expiryDate}
            onChange={(e) => onExpiryDateChange(e.target.value)}
            className="w-full bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {expiryDates.length > 0 ? (
              expiryDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))
            ) : (
              <option value="">No expiry dates available</option>
            )}
          </select>
        </div>

        {/* Show Only High OI */}
        <div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showHighOI}
              onChange={(e) => onShowHighOIChange(e.target.checked)}
              className="w-4 h-4 bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-slate-300">Show only high OI</span>
          </label>
        </div>

        {/* Lot Multiplier */}
        <div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showLotMultiplier}
              onChange={(e) => onShowLotMultiplierChange(e.target.checked)}
              className="w-4 h-4 bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-slate-300">Show values × Lot size</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 ml-6">
            Multiply OI, Change OI, and Volume by lot size
          </p>
        </div>
      </div>
    </div>
  )
}

