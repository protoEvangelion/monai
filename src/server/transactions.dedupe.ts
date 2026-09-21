/** Shared helpers for spotting reconnect/import duplicate transactions. */

export function normalizeVendorName(value: string | null | undefined) {
  const raw = String(value ?? "");
  const isTransferLike = /\b(transfer|transaction#|zelle)\b/i.test(raw);

  let normalized = raw
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");

  // Keep account masks / confirmation numbers for transfers so different
  // same-day $25 moves (…2929 vs …6002) are not treated as duplicates.
  if (!isTransferLike) {
    normalized = normalized
      .replace(
        /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)\b/g,
        " ",
      )
      .replace(/[^a-z0-9]+/g, " ")
      .replace(
        /\b(online|payment|bill|com|www|llc|inc|store|mobile|thank|you|to|from|ppd|id)\b/g,
        " ",
      )
      .replace(/\b\d+\b/g, " ");
  } else {
    normalized = normalized.replace(/[^a-z0-9.]+/g, " ");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

/** Same/near vendor after stripping dates, state codes, and store noise. */
export function vendorsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = normalizeVendorName(left);
  const b = normalizeVendorName(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const transferLike =
    /\b(transfer|transaction|zelle)\b/.test(a) || /\b(transfer|transaction|zelle)\b/.test(b);
  // Transfers often share boilerplate; only exact normalized match counts.
  if (transferLike) return false;

  if (a.includes(b) || b.includes(a)) return true;

  const tokensA = new Set(a.split(" ").filter((token) => token.length > 1));
  const tokensB = new Set(b.split(" ").filter((token) => token.length > 1));
  if (!tokensA.size || !tokensB.size) return false;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const min = Math.min(tokensA.size, tokensB.size);
  return overlap >= Math.min(2, min) && overlap / min >= 0.6;
}

export function utcDayMs(date: Date | string | number) {
  const value = date instanceof Date ? date : new Date(date);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function amountCents(amount: number) {
  return Math.round(Number(amount) * 100);
}

/** Same amount, vendor match, and dates within one calendar day (inclusive). */
export function isNearDuplicateTransaction(
  left: { amount: number; date: Date | string | number; vendor: string },
  right: { amount: number; date: Date | string | number; vendor: string },
) {
  if (amountCents(left.amount) !== amountCents(right.amount)) return false;
  const dayDiff = Math.abs(utcDayMs(left.date) - utcDayMs(right.date)) / 86_400_000;
  if (dayDiff > 1) return false;
  return vendorsMatch(left.vendor, right.vendor);
}

/**
 * Incoming sync duplicate check.
 * - ±1 day + same vendor/amount → duplicate (pending vs posted date drift / reconnect)
 * - same day + same vendor/amount → duplicate only across different accounts
 *   (same-account same-day doubles can be legitimate)
 */
export function isIncomingSyncDuplicate(
  existing: {
    accountId: number;
    amount: number;
    date: Date | string | number;
    vendor: string;
  },
  incoming: {
    accountId: number;
    amount: number;
    date: Date | string | number;
    vendor: string;
  },
) {
  if (amountCents(existing.amount) !== amountCents(incoming.amount)) return false;
  if (!vendorsMatch(existing.vendor, incoming.vendor)) return false;
  const dayDiff =
    Math.abs(utcDayMs(existing.date) - utcDayMs(incoming.date)) / 86_400_000;
  if (dayDiff > 1) return false;
  if (dayDiff === 0 && existing.accountId === incoming.accountId) return false;
  return true;
}
