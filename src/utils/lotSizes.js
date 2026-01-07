/**
 * Lot Size Configuration for NSE Indices
 * Used for calculating OI, Change OI, and Volume in terms of shares
 */
export const LOT_SIZES = {
  BANKNIFTY: 30,
  NIFTY: 65,
  MIDCPNIFTY: 120,
  FINNIFTY: 60,
};

/**
 * Get lot size for a given symbol
 * @param {string} symbol - Symbol name (NIFTY, BANKNIFTY, etc.)
 * @returns {number} Lot size
 */
export function getLotSize(symbol) {
  return LOT_SIZES[symbol.toUpperCase()] || 1;
}

