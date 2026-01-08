/**
 * Lot Size Configuration for NSE and BSE Indices
 * Used for calculating OI, Change OI, and Volume in terms of shares
 */
export const LOT_SIZES = {
  BANKNIFTY: 30,
  NIFTY: 65,
  MIDCPNIFTY: 120,
  FINNIFTY: 60,
  SENSEX: 20,
  BANKEX: 15, // TODO: Verify BANKEX lot size
};

/**
 * Strike Interval Configuration
 * Different indices have different strike price intervals
 */
export const STRIKE_INTERVALS = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  MIDCPNIFTY: 25, // MIDCPNIFTY uses 25 point intervals
  SENSEX: 100, // TODO: Verify SENSEX strike interval
  BANKEX: 100, // TODO: Verify BANKEX strike interval
};

/**
 * Get lot size for a given symbol
 * @param {string} symbol - Symbol name (NIFTY, BANKNIFTY, etc.)
 * @returns {number} Lot size
 */
export function getLotSize(symbol) {
  return LOT_SIZES[symbol.toUpperCase()] || 1;
}

/**
 * Get strike interval for a given symbol
 * @param {string} symbol - Symbol name (NIFTY, BANKNIFTY, etc.)
 * @returns {number} Strike interval (points between strikes)
 */
export function getStrikeInterval(symbol) {
  return STRIKE_INTERVALS[symbol.toUpperCase()] || 50; // Default to 50 if unknown
}


