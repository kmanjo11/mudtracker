/**
 * Format a number with commas and specified decimal places
 * @param num The number to format
 * @param decimals Number of decimal places
 * @returns Formatted string
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format a price change with + or - prefix and % suffix
 * @param change The price change percentage
 * @returns Formatted string
 */
export function formatPriceChange(change: number): string {
  const prefix = change >= 0 ? '+' : '';
  return `${prefix}${change.toFixed(2)}%`;
}

/**
 * Format a date to a readable string
 * @param date The date to format
 * @returns Formatted string
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a timestamp to a readable string
 * @param date The date to format
 * @returns Formatted string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format an address to show only the first and last few characters
 * @param address The address to format
 * @param startChars Number of characters to show at the start
 * @param endChars Number of characters to show at the end
 * @returns Formatted string
 */
export function formatAddress(address: string, startChars: number = 4, endChars: number = 4): string {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
}

/**
 * Format a token amount with symbol
 * @param amount The amount to format
 * @param symbol The token symbol
 * @param decimals Number of decimal places
 * @returns Formatted string
 */
export function formatTokenAmount(amount: number, symbol: string, decimals: number = 6): string {
  return `${formatNumber(amount, decimals)} ${symbol}`;
}

/**
 * Format a USD value
 * @param amount The amount to format
 * @param decimals Number of decimal places
 * @returns Formatted string
 */
export function formatUSD(amount: number, decimals: number = 2): string {
  return `$${formatNumber(amount, decimals)}`;
}
