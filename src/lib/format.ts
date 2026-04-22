/**
 * Formats a number as a currency string with thousands separators.
 * @param amount - The number to format
 * @param options - Optional formatting options
 * @returns A formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(amount: number, options: { 
  withSign?: boolean, 
  minimumFractionDigits?: number,
  maximumFractionDigits?: number 
} = {}) {
  let { 
    minimumFractionDigits = 2, 
    maximumFractionDigits = 2 
  } = options;
  const { withSign = false } = options;

  // Ensure minimum is not greater than maximum
  if (minimumFractionDigits > maximumFractionDigits) {
    minimumFractionDigits = maximumFractionDigits;
  }

  const absoluteAmount = Math.abs(amount);
  const formatted = absoluteAmount.toLocaleString('en-US', {
    style: 'decimal',
    minimumFractionDigits,
    maximumFractionDigits,
  });

  const sign = withSign && amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}$${formatted}`;
}

/**
 * Formats a number with thousands separators but no currency symbol.
 * @param value - The number to format
 * @returns A formatted string (e.g., "1,234.56")
 */
export function formatNumber(value: number, fractionDigits = 0) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
