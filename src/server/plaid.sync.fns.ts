import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { plaidItems, accounts, transactions, historicalBalances } from "../db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  plaidPost,
  isMissingPlaidItemError,
  isPlaidReconnectRequiredError,
  deleteLocalItemData,
} from "./plaid.utils";
import { AI_CATEGORIZE_MAX_TRANSACTIONS, applyRulesForItem } from "./categorize.fns";
import { isIncomingSyncDuplicate } from "./transactions.dedupe";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export { AI_CATEGORIZE_MAX_TRANSACTIONS };
const syncInFlight = new Set<number>();

type TransactionMetadataCarryover = {
  accountId: number;
  amount: number;
  categoryId: number | null;
  date: Date | string;
  isReviewed: boolean;
  merchantName: string;
  name: string | null;
  note: string | null;
  plaidTransactionId: string | null;
  transactionType: "regular" | "income" | "transfer";
};

function plaidTransactionDate(tx: any) {
  return new Date(tx.authorized_date ?? tx.date);
}

function plaidTransactionDateTime(tx: any) {
  const value = tx.authorized_datetime ?? tx.datetime;
  return value ? new Date(value) : null;
}

function plaidTransactionFields(tx: any, accountId: number) {
  return {
    accountId,
    plaidTransactionId: tx.transaction_id,
    amount: tx.amount,
    date: plaidTransactionDate(tx),
    datetime: plaidTransactionDateTime(tx),
    name: tx.name,
    merchantName: tx.merchant_name ?? tx.name,
    location: tx.location?.address ?? null,
    isRecurring: tx.recurring_transaction_id != null,
    isPending: Boolean(tx.pending),
  };
}

function plaidTransactionId(value: any) {
  if (typeof value === "string") return value.trim();
  return String(value?.transaction_id ?? "").trim();
}

function postedPendingTransactionId(value: any) {
  if (value?.pending) return "";
  return String(value?.pending_transaction_id ?? "").trim();
}

function pendingReplacement(value: any) {
  const pendingId = postedPendingTransactionId(value);
  const postedId = plaidTransactionId(value);
  if (!pendingId || !postedId) return null;
  return { pendingId, postedId };
}

function cents(value: number) {
  return Math.round(value * 100);
}

function normalizedTransactionName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type ExistingDedupeRow = {
  accountId: number;
  amount: number;
  date: Date;
  vendor: string;
  claimed: boolean;
};

async function loadExistingDedupeRows(
  db: typeof import("../db").db,
  userId: string,
  _excludeAccountIds: number[],
) {
  const rows = await db.all<{
    account_id: number;
    amount: number;
    date: number | Date;
    merchant_name: string;
    name: string | null;
  }>(sql`
    select t.account_id as account_id, t.merchant_name as merchant_name, t.name as name,
      t.amount as amount, t.date as date
    from transactions t
    join accounts a on a.id = t.account_id
    left join plaid_items p on p.id = a.plaid_item_id
    where (p.user_id = ${userId} or a.user_id = ${userId})
  `);

  return rows.map((row) => {
    const date =
      row.date instanceof Date ? row.date : new Date(Number(row.date) * 1000);
    return {
      accountId: row.account_id,
      amount: row.amount,
      date,
      vendor: row.merchant_name || row.name || "",
      claimed: false,
    } satisfies ExistingDedupeRow;
  });
}

/** Drop incoming txs that already exist for this user (keep categorized originals). */
function filterDuplicateIncomingTransactions(
  existingRows: ExistingDedupeRow[],
  incoming: Array<{ accountId: number; tx: any }>,
) {
  const kept: Array<{ accountId: number; tx: any }> = [];
  let skipped = 0;

  for (const row of incoming) {
    const vendor = String(row.tx.merchant_name ?? row.tx.name ?? "");
    const candidate = {
      accountId: row.accountId,
      amount: Number(row.tx.amount),
      date: plaidTransactionDate(row.tx),
      vendor,
    };

    const match = existingRows.find(
      (existing) => !existing.claimed && isIncomingSyncDuplicate(existing, candidate),
    );
    if (match) {
      match.claimed = true;
      skipped += 1;
      continue;
    }

    // Also claim against already-kept incoming (±1 day reconnect pairs in same batch).
    const batchMatch = kept.find((prior) =>
      isIncomingSyncDuplicate(
        {
          accountId: prior.accountId,
          amount: Number(prior.tx.amount),
          date: plaidTransactionDate(prior.tx),
          vendor: String(prior.tx.merchant_name ?? prior.tx.name ?? ""),
        },
        candidate,
      ),
    );
    if (batchMatch) {
      skipped += 1;
      continue;
    }

    kept.push(row);
    existingRows.push({ ...candidate, claimed: true });
  }

  return { kept, skipped };
}

function hasUserMetadata(row: TransactionMetadataCarryover) {
  return Boolean(
    row.categoryId !== null ||
      row.isReviewed ||
      row.note ||
      row.transactionType !== "regular",
  );
}

function metadataMatchesPlaidTransaction(
  metadata: TransactionMetadataCarryover,
  tx: any,
  accountId: number,
) {
  if (metadata.accountId !== accountId) return false;
  if (cents(metadata.amount) !== cents(Number(tx.amount))) return false;

  const metadataDate = new Date(metadata.date).getTime();
  const txDate = plaidTransactionDate(tx).getTime();
  if (Number.isNaN(metadataDate) || Number.isNaN(txDate)) return false;
  if (Math.abs(metadataDate - txDate) > 4 * 24 * 60 * 60 * 1000) return false;

  const metadataNames = [
    normalizedTransactionName(metadata.merchantName),
    normalizedTransactionName(metadata.name),
  ].filter(Boolean);
  const txNames = [
    normalizedTransactionName(tx.merchant_name),
    normalizedTransactionName(tx.name),
  ].filter(Boolean);

  return metadataNames.some((metadataName) => txNames.includes(metadataName));
}

function metadataDateDistance(metadata: TransactionMetadataCarryover, tx: any) {
  return Math.abs(new Date(metadata.date).getTime() - plaidTransactionDate(tx).getTime());
}

function findMetadataCarryover({
  accountId,
  metadataRows,
  tx,
}: {
  accountId: number;
  metadataRows: TransactionMetadataCarryover[];
  tx: any;
}) {
  const pendingId = postedPendingTransactionId(tx);
  const directMatch = pendingId
    ? metadataRows.find((metadata) => metadata.plaidTransactionId === pendingId)
    : undefined;
  if (directMatch && hasUserMetadata(directMatch)) return directMatch;

  return metadataRows
    .filter(hasUserMetadata)
    .filter((metadata) => metadataMatchesPlaidTransaction(metadata, tx, accountId))
    .sort((a, b) => metadataDateDistance(a, tx) - metadataDateDistance(b, tx))[0];
}

async function getPlaidTransactionMetadata(
  db: typeof import("../db").db,
  plaidTransactionIds: string[],
) {
  const uniqueIds = [...new Set(plaidTransactionIds.filter(Boolean))];
  if (!uniqueIds.length) return [];

  return db.query.transactions.findMany({
    where: inArray(transactions.plaidTransactionId, uniqueIds),
  });
}

async function deletePlaidTransactions(db: typeof import("../db").db, plaidTransactionIds: string[]) {
  const uniqueIds = [...new Set(plaidTransactionIds.filter(Boolean))];
  if (!uniqueIds.length) return 0;

  const parents = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.plaidTransactionId, uniqueIds));
  const parentIds = parents.map((row) => row.id);

  if (parentIds.length) {
    await db.delete(transactions).where(inArray(transactions.splitParentId, parentIds));
  }

  const deleted = await db
    .delete(transactions)
    .where(inArray(transactions.plaidTransactionId, uniqueIds))
    .returning({ id: transactions.id });

  return deleted.length;
}

async function mergePendingMetadataIntoPosted(
  db: typeof import("../db").db,
  pendingId: number,
  postedId: number,
) {
  const [pending, posted] = await Promise.all([
    db.query.transactions.findFirst({ where: eq(transactions.id, pendingId) }),
    db.query.transactions.findFirst({ where: eq(transactions.id, postedId) }),
  ]);

  if (!pending || !posted) return;
  // Only merge when the "pending" row is actually pending — avoid deleting posted twins.
  if (!pending.isPending) return;

  await db
    .update(transactions)
    .set({
      categoryId: posted.categoryId ?? pending.categoryId,
      isReviewed: posted.isReviewed || pending.isReviewed,
      note: posted.note ?? pending.note,
      isPending: false,
      transactionType:
        posted.transactionType === "regular" && pending.transactionType !== "regular"
          ? pending.transactionType
          : posted.transactionType,
    })
    .where(eq(transactions.id, postedId));
}

async function replacePendingTransactions(
  db: typeof import("../db").db,
  replacements: { pendingId: string; postedId: string }[],
) {
  let replacedCount = 0;

  for (const replacement of replacements) {
    const [pending, posted] = await Promise.all([
      db.query.transactions.findFirst({
        where: eq(transactions.plaidTransactionId, replacement.pendingId),
      }),
      db.query.transactions.findFirst({
        where: eq(transactions.plaidTransactionId, replacement.postedId),
      }),
    ]);

    if (!pending || !posted) continue;
    if (!pending.isPending) continue;

    await mergePendingMetadataIntoPosted(db, pending.id, posted.id);
    await db.delete(transactions).where(eq(transactions.id, pending.id));
    replacedCount += 1;
  }

  return replacedCount;
}

async function cleanupLikelyPendingDuplicates(db: typeof import("../db").db, itemId: number) {
  const duplicateRows = await db.all<{ pending_id: number; posted_id: number }>(sql`
    select pending.id as pending_id, posted.id as posted_id
    from transactions pending
    join transactions posted
      on posted.account_id = pending.account_id
     and lower(posted.merchant_name) = lower(pending.merchant_name)
     and round(abs(posted.amount), 2) = round(abs(pending.amount), 2)
     and posted.id <> pending.id
     and pending.is_pending = 1
     and posted.is_pending = 0
     and posted.date >= pending.date
     and posted.date <= pending.date + (4 * 24 * 60 * 60)
    join accounts account
      on account.id = pending.account_id
    where account.plaid_item_id = ${itemId}
  `);
  const pairs = Array.from(
    new Map(duplicateRows.map((row) => [row.pending_id, row.posted_id])).entries(),
  );

  if (!pairs.length) return 0;

  for (const [pendingId, postedId] of pairs) {
    await mergePendingMetadataIntoPosted(db, pendingId, postedId);
  }

  const deleted = await db
    .delete(transactions)
    .where(inArray(transactions.id, pairs.map(([pendingId]) => pendingId)))
    .returning({ id: transactions.id });

  return deleted.length;
}

export async function syncTransactions(
  accessToken: string,
  itemId: number,
  userId: string,
  fullHistory = false,
  categorizeAfterSync = true,
) {
  const { db } = await import("../db");
  console.log(`Starting sync for item ${itemId}${fullHistory ? " (full history)" : ""}`);

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  });
  let cursor = fullHistory ? undefined : (item?.cursor ?? undefined);
  let hasMore = true;
  let addedCount = 0;
  const metadataCarryovers: TransactionMetadataCarryover[] = [];

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountMap = new Map(dbAccounts.map((a) => [a.plaidAccountId, a.id]));
  const itemAccountIds = dbAccounts.map((account) => account.id);
  const existingDedupeRows = await loadExistingDedupeRows(db, userId, itemAccountIds);
  let skippedDuplicateCount = 0;

  try {
    while (hasMore) {
      const page = await plaidPost("/transactions/sync", {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      });

      const removedPlaidTransactionIds = (page.removed ?? []).map(plaidTransactionId);
      const pageMetadataCarryovers = await getPlaidTransactionMetadata(db, removedPlaidTransactionIds);
      metadataCarryovers.push(...pageMetadataCarryovers);

      const removedCount = await deletePlaidTransactions(db, removedPlaidTransactionIds);
      if (removedCount > 0) {
        console.log(`Removed ${removedCount} deleted Plaid transactions for item ${itemId}`);
      }

      const incoming = (page.added ?? [])
        .filter((tx: any) => accountMap.has(tx.account_id))
        .map((tx: any) => ({
          accountId: accountMap.get(tx.account_id)!,
          tx,
        }));
      const { kept, skipped } = filterDuplicateIncomingTransactions(
        existingDedupeRows,
        incoming,
      );
      skippedDuplicateCount += skipped;

      const inserted = await Promise.all(
        kept.map(({ accountId, tx }) => {
          const values = plaidTransactionFields(tx, accountId);
          const metadata = findMetadataCarryover({
            accountId,
            metadataRows: metadataCarryovers,
            tx,
          });
          return db
            .insert(transactions)
            .values({
              ...values,
              categoryId: metadata?.categoryId ?? null,
              isReviewed: metadata?.isReviewed ?? false,
              note: metadata?.note ?? null,
              transactionType: metadata?.transactionType ?? "regular",
            })
            .onConflictDoUpdate({
              target: transactions.plaidTransactionId,
              set: values,
            });
        }),
      );
      addedCount += inserted.length;

      await Promise.all(
        page.modified
          .filter((tx: any) => accountMap.has(tx.account_id))
          .map((tx: any) =>
            db
              .update(transactions)
              .set(plaidTransactionFields(tx, accountMap.get(tx.account_id)!))
              .where(eq(transactions.plaidTransactionId, tx.transaction_id)),
          ),
      );

      const pendingReplacementCount = await replacePendingTransactions(
        db,
        [...(page.added ?? []), ...(page.modified ?? [])]
          .map(pendingReplacement)
          .filter((replacement): replacement is { pendingId: string; postedId: string } =>
            Boolean(replacement),
          ),
      );
      if (pendingReplacementCount > 0) {
        console.log(
          `Replaced ${pendingReplacementCount} pending transactions with posted transactions for item ${itemId}`,
        );
      }

      cursor = page.next_cursor;
      hasMore = page.has_more;

      await db.update(plaidItems).set({ cursor }).where(eq(plaidItems.id, itemId));
    }

    console.log(
      `Sync completed for item ${itemId}. Total added: ${addedCount}` +
        (skippedDuplicateCount
          ? `, skipped ${skippedDuplicateCount} duplicate(s) (kept existing)`
          : ""),
    );
    await db.update(plaidItems).set({ lastSyncedAt: new Date() }).where(eq(plaidItems.id, itemId));
    const cleanupCount = await cleanupLikelyPendingDuplicates(db, itemId);
    if (cleanupCount > 0) {
      console.log(`Cleaned up ${cleanupCount} likely pending duplicate transactions for item ${itemId}`);
    }
    if (categorizeAfterSync) {
      // Rules only on sync — AI runs in the browser via Chrome Prompt API.
      const ruleResult = await applyRulesForItem(userId, itemId).catch((error) => {
        console.warn(
          `[rules] apply failed for item ${itemId}:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      });
      if (ruleResult?.updated) {
        console.log(
          `[rules] applied to ${ruleResult.updated} transaction(s) for item ${itemId}`,
        );
      }
    }

    // Refresh live balances before snapshotting — otherwise history just copies stale values
    const { refreshAccountBalances } = await import("./plaid.utils");
    await refreshAccountBalances(accessToken, itemId).catch((err) =>
      console.warn(
        `[sync] Account balance refresh failed for item ${itemId}:`,
        err?.message ?? err,
      ),
    );

    const { syncInvestmentsHoldings } = await import("./plaid.investments.fns");
    await syncInvestmentsHoldings(accessToken, itemId).catch((err) =>
      console.warn(
        `[sync] Investments holdings sync skipped for item ${itemId}:`,
        err?.message ?? err,
      ),
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const freshAccounts = await db.query.accounts.findMany({
      where: eq(accounts.plaidItemId, itemId),
    });
    await Promise.all(
      freshAccounts.map((acct) =>
        db
          .insert(historicalBalances)
          .values({
            accountId: acct.id,
            date: today,
            balance: acct.currentBalance,
            source: "snapshot",
          })
          .onConflictDoUpdate({
            target: [historicalBalances.accountId, historicalBalances.date],
            set: { balance: acct.currentBalance, source: "snapshot" },
          }),
      ),
    );
  } catch (error) {
    if (isMissingPlaidItemError(error)) {
      console.warn(`Sync skipped for stale item ${itemId}; removing local records`);
      await deleteLocalItemData(itemId);
      return;
    }
    const log = isPlaidReconnectRequiredError(error) ? console.warn : console.error;
    log(`Sync failed for item ${itemId}:`, error);
    throw error;
  }
}

export const manualSync = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });
  await Promise.all(
    items.map((item) => syncTransactions(item.accessToken, item.id, userId, false, false)),
  );
});

export const syncLatestTransactionsOnLogin = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) return { itemCount: 0, syncedItemCount: 0, failedItemCount: 0 };

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });

  const results = await Promise.all(
    items.map(async (item) => {
      if (syncInFlight.has(item.id)) {
        console.log(`Login sync skipped for item ${item.id}; sync already in progress`);
        return "skipped" as const;
      }

      syncInFlight.add(item.id);
      try {
        console.log(`Login sync: fetching latest transactions for item ${item.id}`);
        await syncTransactions(item.accessToken, item.id, userId);
        return "synced" as const;
      } catch (error) {
        const log = isPlaidReconnectRequiredError(error) ? console.warn : console.error;
        log(`Login sync failed for item ${item.id}:`, error);
        return "failed" as const;
      } finally {
        syncInFlight.delete(item.id);
      }
    }),
  );

  return {
    itemCount: items.length,
    syncedItemCount: results.filter((result) => result === "synced").length,
    failedItemCount: results.filter((result) => result === "failed").length,
  };
});

export const autoSync = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) return;

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });
  const now = Date.now();
  const stale = items.filter(
    (item) => now - (item.lastSyncedAt?.getTime() ?? 0) >= SYNC_INTERVAL_MS,
  );

  await Promise.all(
    stale.map((item) => {
      if (syncInFlight.has(item.id)) {
        console.log(`Auto-sync skipped for item ${item.id}; sync already in progress`);
        return Promise.resolve();
      }

      console.log(
        `Auto-sync: item ${item.id} last synced ${Math.round((now - (item.lastSyncedAt?.getTime() ?? 0)) / 3_600_000)}h ago`,
      );
      syncInFlight.add(item.id);
      return syncTransactions(item.accessToken, item.id, userId)
        .catch((error) => {
          const log = isPlaidReconnectRequiredError(error) ? console.warn : console.error;
          log(`Auto-sync failed for item ${item.id}:`, error);
        })
        .finally(() => syncInFlight.delete(item.id));
    }),
  );
});
