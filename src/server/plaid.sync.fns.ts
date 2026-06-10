import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { plaidItems, accounts, transactions, historicalBalances } from "../db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import {
  plaidPost,
  isMissingPlaidItemError,
  isPlaidReconnectRequiredError,
  deleteLocalItemData,
} from "./plaid.utils";
import { categorizeTransactions } from "./categorize.fns";
import { isCatchAllCategory } from "./categorize.utils";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const AI_CATEGORIZE_MAX_TRANSACTIONS = 100;
const syncInFlight = new Set<number>();

function plaidTransactionFields(tx: any, accountId: number) {
  return {
    accountId,
    plaidTransactionId: tx.transaction_id,
    amount: tx.amount,
    date: new Date(tx.date),
    datetime: tx.datetime ? new Date(tx.datetime) : null,
    name: tx.name,
    merchantName: tx.merchant_name ?? tx.name,
    location: tx.location?.address ?? null,
    isRecurring: tx.recurring_transaction_id != null,
  };
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
  let loggedPlaidTransactionSample = false;

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountMap = new Map(dbAccounts.map((a) => [a.plaidAccountId, a.id]));

  try {
    while (hasMore) {
      const page = await plaidPost("/transactions/sync", {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      });

      if (!loggedPlaidTransactionSample) {
        const sampleTx = page.added?.[0] ?? page.modified?.[0];
        if (sampleTx) {
          console.log(
            "Plaid transaction sample:",
            JSON.stringify(sampleTx, null, 2),
          );
          loggedPlaidTransactionSample = true;
        }
      }

      const inserted = await Promise.all(
        page.added
          .filter((tx: any) => accountMap.has(tx.account_id))
          .map((tx: any) => {
            const values = plaidTransactionFields(tx, accountMap.get(tx.account_id)!);
            return db
              .insert(transactions)
              .values({
                ...values,
                isReviewed: false,
                transactionType: "regular",
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

      cursor = page.next_cursor;
      hasMore = page.has_more;

      await db.update(plaidItems).set({ cursor }).where(eq(plaidItems.id, itemId));
    }

    if (!loggedPlaidTransactionSample) {
      console.log("Plaid transaction sample: no added or modified transactions returned");
    }

    console.log(`Sync completed for item ${itemId}. Total added: ${addedCount}`);
    await db.update(plaidItems).set({ lastSyncedAt: new Date() }).where(eq(plaidItems.id, itemId));
    if (categorizeAfterSync) {
      await categorizeTransactions(userId, itemId);
    }

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
          .onConflictDoNothing(),
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

export const runAICategorization = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, limit, scope, searchQuery } = ((ctx as any)?.data ?? {}) as {
    ids?: number[];
    limit?: number;
    scope?: "all" | "review";
    searchQuery?: string;
  };
  const batchLimit = Math.min(
    AI_CATEGORIZE_MAX_TRANSACTIONS,
    Math.max(1, Number(limit) || AI_CATEGORIZE_MAX_TRANSACTIONS),
  );
  const selectedIds = Array.isArray(ids)
    ? ids.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : undefined;

  let uniqueSelectedIds = selectedIds ? [...new Set(selectedIds)].slice(0, batchLimit) : undefined;

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });

  if (!uniqueSelectedIds?.length && scope) {
    const accountIds = items.flatMap((item) => item.accounts.map((account) => account.id));
    if (accountIds.length > 0) {
      const query = searchQuery?.trim().toLowerCase() ?? "";
      const candidates = await db.query.transactions.findMany({
        where: inArray(transactions.accountId, accountIds),
        orderBy: [desc(transactions.date)],
        with: { category: true },
      });

      uniqueSelectedIds = candidates
        .filter((tx) => (scope === "review" ? !tx.isReviewed : true))
        .filter((tx) => tx.transactionType === "regular")
        .filter((tx) => !query || tx.merchantName.toLowerCase().includes(query))
        .filter(
          (tx) =>
            tx.categoryId == null ||
            (tx.category?.name ? isCatchAllCategory(tx.category.name) : false),
        )
        .slice(0, batchLimit)
        .map((tx) => tx.id);
    }
  }

  if (!uniqueSelectedIds?.length) {
    throw new Error("No uncategorized transactions found for AI categorization.");
  }

  try {
    const results = await Promise.all(
      items.map((item) =>
        categorizeTransactions(userId, item.id, {
          transactionIds: uniqueSelectedIds,
        }),
      ),
    );

    return {
      requestedCount: results.reduce((sum, result) => sum + result.requestedCount, 0),
      updatedCount: results.reduce((sum, result) => sum + result.updatedCount, 0),
      skippedCount: results.reduce((sum, result) => sum + result.skippedCount, 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      [
        "[categorize] batch failed",
        `  requestedTransactionIds: ${uniqueSelectedIds.length}`,
        `  error: ${message}`,
      ].join("\n"),
    );
    throw new Error(`AI categorization failed: ${message}`);
  }
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
