/**
 * Number formatting utilities for financial data
 */

/**
 * Format large numbers (Lakhs/Crores)
 * Values < 100,000: Display as-is with comma formatting
 * Values >= 100,000 (1L): Display as XX.XXL
 * Values >= 10,000,000 (1Cr): Display as XX.XXCr
 * @param {number} num - Number to format
 * @returns {string} Formatted string
 */
export function formatLargeNumber(num) {
  const value = parseFloat(num) || 0;
  
  // Handle negative numbers
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  let formatted;
  if (absValue >= 10000000) {
    // >= 1 Crore: Display as XX.XXCr
    formatted = (absValue / 10000000).toFixed(2) + 'Cr';
  } else if (absValue >= 100000) {
    // >= 1 Lakh: Display as XX.XXL
    formatted = (absValue / 100000).toFixed(2) + 'L';
  } else {
    // < 1 Lakh: Display as-is with comma formatting
    formatted = absValue.toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }
  
  return isNegative ? '-' + formatted : formatted;
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

