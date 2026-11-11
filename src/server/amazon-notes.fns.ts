import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, and, isNull, or, sql } from "drizzle-orm";
import { transactions, plaidItems, accounts } from "../db/schema";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  matchAmazonNotes,
  parseAmazonScrape,
  rowMatchesAmazonTarget,
  type AmazonWorklistRow,
} from "./amazon-match";

export type AmazonReconcileResult = {
  worklistCount: number;
  targetedCount: number;
  matchedCount: number;
  skippedCount: number;
  updatedCount: number;
  updates: Array<{ transactionId: number; note: string; orderId: string }>;
  skipped: Array<{
    transactionId: number;
    merchantName: string;
    amount: number;
    reason: string;
  }>;
};

type ReconcileInput = {
  /** Raw JSON pasted from the Amazon payments scrape snippet. */
  scrapeJson: string;
  /** Comma-separated descriptors / ids, or "all". Defaults to "all". */
  targets?: string;
  /** Only touch charges that are not reviewed yet. */
  unreviewedOnly?: boolean;
  /** Preview without writing. */
  dryRun?: boolean;
};

const AMAZON_MATCH_SQL = sql`(
  lower(${transactions.merchantName}) like '%amazon%'
  or lower(${transactions.merchantName}) like '%amzn%'
  or lower(coalesce(${transactions.name}, '')) like '%amazon%'
)`;

/**
 * Fetch Amazon charges that still have no note for the signed-in user.
 * Runs against whatever DB the app is pointed at (local SQLite or Turso), so
 * the same code path works in dev and in production.
 */
async function loadAmazonWorklist(userId: string, unreviewedOnly: boolean) {
  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });
  // Manual accounts (no Plaid item) can also hold Amazon charges.
  const manualAccounts = await db.query.accounts.findMany({
    where: and(isNull(accounts.plaidItemId), eq(accounts.userId, userId)),
  });
  const accountIds = [
    ...items.flatMap((item) => item.accounts.map((account) => account.id)),
    ...manualAccounts.map((account) => account.id),
  ];
  if (accountIds.length === 0) return [];

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchantName: transactions.merchantName,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        AMAZON_MATCH_SQL,
        or(isNull(transactions.note), sql`trim(${transactions.note}) = ''`),
        sql`${transactions.amount} > 0`,
        unreviewedOnly ? eq(transactions.isReviewed, false) : sql`1 = 1`,
      ),
    );

  return rows.map<AmazonWorklistRow>((row) => ({
    id: row.id,
    date: row.date instanceof Date ? Math.floor(row.date.getTime() / 1000) : Number(row.date),
    amount: row.amount,
    merchantName: row.merchantName,
  }));
}

function parseTargets(raw: string | undefined) {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === "all") return "all" as const;
  const list = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ("all" as const);
}

/**
 * Match pasted Amazon payment history against Monai charges and (optionally)
 * write the purchase notes. Replaces the old fire-and-forget agent spawn: the
 * request runs to completion and returns a full report the UI can render.
 */
export const reconcileAmazonNotes = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = ((ctx as any)?.data ?? {}) as Partial<ReconcileInput>;
  const scrape = parseAmazonScrape(input.scrapeJson);
  const targets = parseTargets(input.targets);

  const worklist = await loadAmazonWorklist(userId, Boolean(input.unreviewedOnly));
  const targeted =
    targets === "all"
      ? worklist
      : worklist.filter((row) => targets.some((target) => rowMatchesAmazonTarget(row, target)));

  const { updates, skipped } = matchAmazonNotes(targeted, scrape);

  let updatedCount = 0;
  if (!input.dryRun && updates.length > 0) {
    const { db } = await import("../db");
    for (const update of updates) {
      // Never overwrite a note that another run (or the user) already wrote.
      const result = await db
        .update(transactions)
        .set({ note: update.note })
        .where(
          and(
            eq(transactions.id, update.transactionId),
            or(isNull(transactions.note), sql`trim(${transactions.note}) = ''`),
          ),
        )
        .returning({ id: transactions.id });
      if (result.length > 0) updatedCount += 1;
    }
  }

  return {
    worklistCount: worklist.length,
    targetedCount: targeted.length,
    matchedCount: updates.length,
    skippedCount: skipped.length,
    updatedCount,
    updates,
    skipped,
  } satisfies AmazonReconcileResult;
});
