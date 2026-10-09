/**
 * Shared India-market trading-session helpers for daily paper-account accounting.
 * @module services/trading-session
 */

/** Minimal persisted fields required to identify a daily P&L session. */
export interface PaperAccountPnlSession {
  realised_daily_pnl: unknown
  pnl_session_date?: string | null
}

/** India-market wall-clock fields used by paper-fill session gates. */
export interface IndiaMarketClock {
  weekday: string
  minutesSinceMidnight: number
}

/**
 * Returns the calendar date for an instant in the India market timezone.
 */
export function getIndiaTradingDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Returns the inclusive India-market day boundary used by timestamp queries.
 */
export function getIndiaTradingDayStart(tradingDate: string) {
  return `${tradingDate}T00:00:00+05:30`
}

/**
 * Resolves an instant to its weekday and wall-clock minute in Asia/Kolkata.
 */
export function getIndiaMarketClock(date = new Date()): IndiaMarketClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value || ''
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return { weekday, minutesSinceMidnight: (hour * 60) + minute }
}

/**
 * Allows paper fills only from 09:15:00 through 15:19:59 IST on weekdays.
 */
export function isIndiaPaperFillWindow(date = new Date()) {
  const { weekday, minutesSinceMidnight } = getIndiaMarketClock(date)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)
    && minutesSinceMidnight >= (9 * 60) + 15
    && minutesSinceMidnight < (15 * 60) + 20
}

/**
 * Allows only the system position-close job to retry from 15:20:00 through
 * 15:29:59 IST on weekdays; ordinary AI fills retain the earlier hard cutoff.
 */
export function isIndiaPaperFlattenWindow(date = new Date()) {
  const { weekday, minutesSinceMidnight } = getIndiaMarketClock(date)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)
    && minutesSinceMidnight >= (15 * 60) + 20
    && minutesSinceMidnight < (15 * 60) + 30
}

/**
 * Returns only realised P&L belonging to the requested trading session.
 */
export function resolveDailyRealisedPnl(account: PaperAccountPnlSession, tradingDate: string) {
  if (account.pnl_session_date !== tradingDate) return 0
  const realisedPnl = Number(account.realised_daily_pnl || 0)
  return Number.isFinite(realisedPnl) ? realisedPnl : 0
}
