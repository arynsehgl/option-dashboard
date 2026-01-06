/**
 * Number formatting utilities for financial data
 */

/**
 * Format large numbers (Lakhs/Crores)
 * @param {number} num - Number to format
 * @returns {string} Formatted string
 */
export function formatLargeNumber(num) {
  if (num >= 10000000) {
    return (num / 10000000).toFixed(2) + 'Cr';
  } else if (num >= 100000) {
    return (num / 100000).toFixed(2) + 'L';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toLocaleString();
}

/**
 * Format currency
 * @param {number} num - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(num) {
  return '₹' + parseFloat(num).toFixed(2);
}

/**
 * Format percentage change with color indication
 * @param {number} value - Percentage value
 * @returns {Object} { formatted, color }
 */
export function formatPercentageChange(value) {
  const num = parseFloat(value) || 0;
  const formatted = num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
  const color = num >= 0 ? 'text-green-400' : 'text-red-400';
  return { formatted, color };
}

