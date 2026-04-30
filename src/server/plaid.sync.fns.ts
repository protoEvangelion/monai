import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  plaidItems,
  accounts,
  transactions,
  historicalBalances,
} from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  plaidPost,
  isMissingPlaidItemError,
  deleteLocalItemData,
} from "./plaid.utils";
import { categorizeTransactions } from "./categorize.fns";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function syncTransactions(
  accessToken: string,
  itemId: number,
  userId: string,
  fullHistory = false,
) {
  const { db } = await import("../db");
  console.log(
    `Starting sync for item ${itemId}${fullHistory ? " (full history)" : ""}`,
  );

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  });
  let cursor = fullHistory ? undefined : (item?.cursor ?? undefined);
  let hasMore = true;
  let addedCount = 0;

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

      const inserted = await Promise.all(
        page.added
          .filter((tx: any) => accountMap.has(tx.account_id))
          .map((tx: any) =>
            db
              .insert(transactions)
              .values({
                accountId: accountMap.get(tx.account_id)!,
                plaidTransactionId: tx.transaction_id,
                amount: tx.amount,
                date: new Date(tx.date),
                merchantName: tx.merchant_name ?? tx.name,
                isReviewed: false,
                isRecurring: tx.recurring_transaction_id != null,
              })
              .onConflictDoNothing(),
          ),
      );
      addedCount += inserted.length;

      cursor = page.next_cursor;
      hasMore = page.has_more;

      await db
        .update(plaidItems)
        .set({ cursor })
        .where(eq(plaidItems.id, itemId));
    }

    console.log(
      `Sync completed for item ${itemId}. Total added: ${addedCount}`,
    );
    await db
      .update(plaidItems)
      .set({ lastSyncedAt: new Date() })
      .where(eq(plaidItems.id, itemId));
    await categorizeTransactions(userId, itemId);

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
      console.warn(
        `Sync skipped for stale item ${itemId}; removing local records`,
      );
      await deleteLocalItemData(itemId);
      return;
    }
    console.error(`Sync failed for item ${itemId}:`, error);
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
    items.map((item) => syncTransactions(item.accessToken, item.id, userId)),
  );
});

export const runAICategorization = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids } = ((ctx as any)?.data ?? {}) as { ids?: number[] };
  const selectedIds = Array.isArray(ids)
    ? ids.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      )
    : undefined;

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });
  await Promise.all(
    items.map((item) =>
      categorizeTransactions(userId, item.id, {
        recategorizeAll: true,
        transactionIds: selectedIds,
      }),
    ),
  );
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
      console.log(
        `Auto-sync: item ${item.id} last synced ${Math.round((now - (item.lastSyncedAt?.getTime() ?? 0)) / 3_600_000)}h ago`,
      );
      return syncTransactions(item.accessToken, item.id, userId).catch(
        (error) =>
          console.error(`Auto-sync failed for item ${item.id}:`, error),
      );
    }),
  );
});
