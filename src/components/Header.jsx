import React from 'react'

/**
 * Header Component
 * Displays dashboard title, index selector, spot price, and last updated time
 */
export default function Header({ symbol, onSymbolChange, spotPrice, lastUpdated, onRefresh, isRefreshing }) {
  const formats = {
    time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--:--';
    return new Date(timestamp).toLocaleTimeString('en-US', formats.time);
  };

  return (
    <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Title */}
          <h1 className="text-2xl font-bold text-white">Options Dashboard</h1>

          {/* Index Selector Tabs */}
          <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
            {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].map((sym) => (
              <button
                key={sym}
                onClick={() => onSymbolChange(sym)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  symbol === sym
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-600'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Spot Price and Last Updated */}
          <div className="flex items-center gap-6">
            {spotPrice && (
              <div className="text-right">
                <div className="text-xs text-slate-400">Spot Price</div>
                <div className="text-lg font-bold text-white">
                  ₹{parseFloat(spotPrice).toFixed(2)}
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              {/* Manual Refresh Button */}
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium flex items-center gap-2 transition-colors"
                title="Manual Refresh"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {/* Last Updated */}
              <div className="text-right">
                <div className="text-xs text-slate-400">Last Updated</div>
                <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <span>{formatTime(lastUpdated)}</span>
                  <span className="text-xs text-slate-500 hidden sm:inline">Auto: 30s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

