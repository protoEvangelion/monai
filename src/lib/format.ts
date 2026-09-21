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

/**
 * Formats a past timestamp as a short relative string (e.g. "6 hours ago").
 */
export function formatRelativeTime(value: Date | string | number | null | undefined) {
  if (!value) return "Never synced";
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "Never synced";

  const diffSec = Math.round((Date.now() - ms) / 1000);
  if (diffSec < 45) return "Just now";
  if (diffSec < 90) return "1 minute ago";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffMin < 90) return "1 hour ago";

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffHour < 36) return "1 day ago";

  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  const sign = value > 0 ? "+ " : value < 0 ? "- " : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}
