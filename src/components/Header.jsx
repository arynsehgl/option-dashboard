/** Renders dashboard navigation, symbol selection, and refresh status. */
import React from 'react'
import { Clock3, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import ThemeToggle from './ThemeToggle'

const symbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']

/**
 * Renders the options Dashboard header without changing its selection or refresh behavior.
 */
export default function Header({ symbol, onSymbolChange, spotPrice, lastUpdated, onRefresh, isRefreshing }) {
  /**
   * Formats a dashboard timestamp for compact local display.
   */
  function formatTime(timestamp) {
    if (!timestamp) return '--:--:--'
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  return (
    <header className="relative z-30 px-3 pt-3 sm:px-5">
      <div className="glass-toolbar mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 rounded-[1.35rem] px-3 py-3 pr-16 sm:pr-24">
        <Link to="/zones" className="mr-auto"><BrandMark /></Link>

        <div className="order-3 flex w-full gap-1 overflow-x-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-strong)] p-1 md:order-none md:w-auto" aria-label="Market index">
          {symbols.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSymbolChange(item)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black transition ${symbol === item ? 'bg-indigo-600 text-white shadow-lg' : 'text-muted hover:bg-indigo-500/10 hover:text-ink'}`}
            >
              {item}
            </button>
          ))}
        </div>

        {Boolean(spotPrice) && (
          <div className="hidden text-right lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Spot price</p>
            <p className="mt-0.5 text-sm font-black text-ink">₹{Number(spotPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        )}

        <button type="button" onClick={onRefresh} disabled={isRefreshing} className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" title="Refresh option-chain data">
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">Refresh</span>
        </button>
        <div className="hidden items-center gap-2 text-xs text-muted xl:flex"><Clock3 size={14} /><div><p className="font-bold text-ink">{formatTime(lastUpdated)}</p><p className="text-[9px] uppercase tracking-[0.1em]">30s auto</p></div></div>
        <ThemeToggle />
      </div>
    </header>
  )
}
