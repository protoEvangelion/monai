/**
 * Amazon payment-history matching.
 *
 * Pure functions only — no DB, no CLI, no filesystem. The dashboard modal
 * pastes the JSON produced by `scripts/amazon-scrape-in-browser.js` and this
 * module decides which Monai rows it can safely annotate.
 *
 * Matching rules (from the skill): exact amount incl. cents, Amazon charge date
 * within 3 days of the bank date, and exactly one plausible order. Ambiguous
 * rows are skipped rather than force-matched.
 */

export type AmazonScrapePayment = {
  order_id: string;
  amount_cents: number;
  payment_date?: string | null;
  snippet?: string;
  payment_hint?: string;
};

export type AmazonScrapeOrder = {
  order_id: string;
  order_date?: string | null;
  suggestedNote?: string | null;
  error?: string;
};

export type AmazonScrape = {
  payments: AmazonScrapePayment[];
  orders: AmazonScrapeOrder[];
};

/** Minimal transaction shape the matcher needs. */
export type AmazonWorklistRow = {
  id: number;
  date: number;
  amount: number;
  merchantName: string;
};

export type AmazonMatchUpdate = {
  transactionId: number;
  note: string;
  orderId: string;
};

export type AmazonMatchSkip = {
  transactionId: number;
  merchantName: string;
  amount: number;
  reason: string;
};

export class AmazonScrapeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmazonScrapeParseError";
  }
}

const MAX_DAYS_APART = 3;

/** Validate pasted JSON before it reaches the matcher. */
export function parseAmazonScrape(input: unknown): AmazonScrape {
  if (typeof input === "string") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parseAmazonScrape(JSON.parse(input) as any);
    } catch {
      throw new AmazonScrapeParseError(
        "That isn't valid JSON. Run the scrape snippet again and paste the copied output.",
      );
    }
  }

  const raw = input as Partial<AmazonScrape> | null | undefined;
  if (!raw || typeof raw !== "object") {
    throw new AmazonScrapeParseError("Paste the scrape JSON from the Amazon payments page.");
  }
  if (!Array.isArray(raw.payments) || !Array.isArray(raw.orders)) {
    throw new AmazonScrapeParseError(
      'Expected a "payments" and "orders" array. Make sure you copied window.__amazonScrapeResult, not a single order.',
    );
  }
  if (raw.payments.length === 0) {
    throw new AmazonScrapeParseError(
      "The scrape has no payments. Sign in to Amazon, open Your Payments → Transactions, then run the snippet again.",
    );
  }

  const payments = raw.payments
    .filter((payment): payment is AmazonScrapePayment =>
      Boolean(payment) && typeof payment.order_id === "string" && Number.isFinite(payment.amount_cents),
    )
    .map((payment) => ({
      order_id: payment.order_id,
      amount_cents: Math.round(payment.amount_cents),
      payment_date: payment.payment_date ?? null,
      snippet: payment.snippet ?? "",
      payment_hint: payment.payment_hint ?? "",
    }));

  const orders = raw.orders
    .filter((order): order is AmazonScrapeOrder => Boolean(order) && typeof order.order_id === "string")
    .map((order) => ({
      order_id: order.order_id,
      order_date: order.order_date ?? null,
      suggestedNote: order.suggestedNote ?? null,
      error: order.error,
    }));

  return { payments, orders };
}

function parseAmazonDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysApart(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86_400_000));
}

/**
 * Pair bank rows with scraped payments. Returns what can be written and what
 * to leave alone, with a short reason for each skip so the UI can explain it.
 */
export function matchAmazonNotes(
  worklist: AmazonWorklistRow[],
  scrape: AmazonScrape,
): { updates: AmazonMatchUpdate[]; skipped: AmazonMatchSkip[] } {
  const ordersById = new Map(
    scrape.orders
      .filter((order) => order.suggestedNote && !order.error)
      .map((order) => [order.order_id, order]),
  );

  const chargeDateFor = (payment: AmazonScrapePayment) => {
    const direct = parseAmazonDate(payment.payment_date);
    if (direct) return direct;
    return parseAmazonDate(ordersById.get(payment.order_id)?.order_date);
  };

  const updates: AmazonMatchUpdate[] = [];
  const skipped: AmazonMatchSkip[] = [];

  for (const row of worklist) {
    const bankDate = new Date(row.date * 1000);
    const cents = Math.round(row.amount * 100);

    const candidates = scrape.payments.filter((payment) => {
      if (payment.amount_cents !== cents) return false;
      const chargeDate = chargeDateFor(payment);
      if (!chargeDate) return false;
      return daysApart(chargeDate, bankDate) <= MAX_DAYS_APART;
    });

    if (candidates.length === 0) {
      skipped.push({ ...skipFor(row), reason: "No Amazon payment with that amount and date" });
      continue;
    }

    const orderIds = [...new Set(candidates.map((payment) => payment.order_id))];
    if (orderIds.length > 1) {
      skipped.push({
        ...skipFor(row),
        reason: `Ambiguous — ${orderIds.length} orders fit`,
      });
      continue;
    }

    const order = ordersById.get(orderIds[0]!);
    if (!order?.suggestedNote) {
      skipped.push({
        ...skipFor(row),
        reason: "Order details missing from the scrape",
      });
      continue;
    }

    updates.push({
      transactionId: row.id,
      note: order.suggestedNote,
      orderId: order.order_id,
    });
  }

  return { updates, skipped };
}

function skipFor(row: AmazonWorklistRow) {
  return {
    transactionId: row.id,
    merchantName: row.merchantName,
    amount: row.amount,
  };
}

/** Matches a Monai descriptor against `--targets`-style input. */
export function rowMatchesAmazonTarget(row: AmazonWorklistRow, target: string) {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return row.id === Number(trimmed);
  const upper = trimmed.toUpperCase();
  const starMatch = trimmed.match(/\*([A-Z0-9]+)$/i);
  const token = starMatch?.[1]?.toUpperCase() ?? (/^[A-Z0-9]{6,12}$/i.test(trimmed) ? upper : null);
  if (row.merchantName.toUpperCase().includes(upper)) return true;
  if (!token) return false;
  return row.merchantName.toUpperCase().includes(token);
}
