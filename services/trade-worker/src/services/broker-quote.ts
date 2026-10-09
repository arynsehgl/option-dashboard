/**
 * Normalizes broker-authored Kite quotes without manufacturing timestamps.
 * @module services/broker-quote
 */

/** Minimal Kite quote fields required before a paper fill can be evaluated. */
export interface BrokerQuoteLike {
  last_price?: unknown
  timestamp?: unknown
}

/** Pads one wall-clock component for an explicit timestamp string. */
function padWallClockPart(part: number) {
  return String(part).padStart(2, '0')
}

/**
 * Converts Kite's timezone-less 19-character wall clock into an explicit IST
 * instant. The SDK currently turns that value into a Date using the host
  * timezone, so Date inputs are reconstructed from their local wall fields.
 */
function parseKitePacketTimestamp(value: unknown) {
  if (value instanceof Date) {
    const wallClock = `${value.getFullYear()}-${padWallClockPart(value.getMonth() + 1)}-${padWallClockPart(value.getDate())}T${padWallClockPart(value.getHours())}:${padWallClockPart(value.getMinutes())}:${padWallClockPart(value.getSeconds())}+05:30`
    return new Date(wallClock)
  }
  const text = String(value)
  const timezoneLessMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text)
  return new Date(timezoneLessMatch ? `${timezoneLessMatch[1]}T${timezoneLessMatch[2]}+05:30` : text)
}

/**
 * Returns a positive price and the broker packet timestamp, failing closed when
 * either value is absent or malformed.
 */
export function resolveBrokerQuote(quote: BrokerQuoteLike | null | undefined, instrumentKey: string) {
  const lastPrice = Number(quote?.last_price)
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    throw new Error(`A valid Kite quote price was unavailable for ${instrumentKey}.`)
  }
  if (quote?.timestamp === null || quote?.timestamp === undefined || quote.timestamp === '') {
    throw new Error(`A broker quote timestamp was unavailable for ${instrumentKey}.`)
  }
  const timestamp = parseKitePacketTimestamp(quote.timestamp)
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`The broker quote timestamp was invalid for ${instrumentKey}.`)
  }
  return { lastPrice, quoteTimestamp: timestamp.toISOString() }
}
