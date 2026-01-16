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
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h2 className="text-lg font-semibold mb-4 text-white">FILTERS</h2>
      
      <div className="space-y-6">
        {/* Strike Range */}
        <div>
          <label className="block text-sm text-slate-300 mb-2">
            Number of Strikes: {strikeRange} (ATM centered)
          </label>
          <input
            type="range"
            min="3"
            max="20"
            value={strikeRange}
            onChange={(e) => onStrikeRangeChange(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>3</span>
            <span>20</span>
          </div>
        </div>

        {/* Expiry Date */}
        <div>
          <label className="block text-sm text-slate-300 mb-2">Expiry Date</label>
          <select
            value={expiryDate}
            onChange={(e) => onExpiryDateChange(e.target.value)}
            className="w-full bg-slate-700 text-white border border-slate-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-4 h-4 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
            />
            <span className="ml-2 text-sm text-slate-300">Show only high OI</span>
          </label>
        </div>

        {/* Lot Multiplier */}
        <div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showLotMultiplier}
              onChange={(e) => onShowLotMultiplierChange(e.target.checked)}
              className="w-4 h-4 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
            />
            <span className="ml-2 text-sm text-slate-300">Show values × Lot size</span>
          </label>
          <p className="text-xs text-slate-400 mt-1 ml-6">
            Multiply OI, Change OI, and Volume by lot size
          </p>
        </div>
      </div>
    </div>
  )
}

