import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { plaidItems, accounts, transactions, historicalBalances } from "../db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  plaidPost,
  isMissingPlaidItemError,
  isPlaidPaginationMutationError,
  isPlaidReconnectRequiredError,
  isPlaidEnvMismatchError,
  isPostedTransaction,
  deleteLocalItemData,
} from "./plaid.utils";
import { AI_CATEGORIZE_MAX_TRANSACTIONS, applyRulesForItem } from "./categorize.fns";
import { isIncomingSyncDuplicate, withoutRemovedTransactions } from "./transactions.dedupe";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export { AI_CATEGORIZE_MAX_TRANSACTIONS };
const syncInFlight = new Set<number>();

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
    // Only posted rows reach this function.
    isPending: false,
  };
}

function plaidTransactionId(value: any) {
  if (typeof value === "string") return value.trim();
  return String(value?.transaction_id ?? "").trim();
}

type ExistingDedupeRow = {
  accountId: number;
  amount: number;
  date: Date;
  vendor: string;
  plaidTransactionId: string | null;
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
    plaid_transaction_id: string | null;
  }>(sql`
    select t.account_id as account_id, t.merchant_name as merchant_name, t.name as name,
      t.amount as amount, t.date as date, t.plaid_transaction_id as plaid_transaction_id
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
      plaidTransactionId: row.plaid_transaction_id ?? null,
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
    existingRows.push({
      ...candidate,
      plaidTransactionId: row.tx.transaction_id ?? null,
      claimed: true,
    });
  }

  return { kept, skipped };
}

/** Delete Plaid rows by transaction id, along with any split legs hanging off them. */
async function deletePlaidTransactions(
  db: typeof import("../db").db,
  plaidTransactionIds: string[],
) {
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

/**
 * Pending rows are not stored any more. Remove any left over from before this
 * rule (they are either already replaced by a posted row or were voided).
 */
async function purgePendingTransactions(db: typeof import("../db").db, itemId: number) {
  const stale = await db.all<{ id: number }>(sql`
    select t.id as id
    from transactions t
    join accounts a on a.id = t.account_id
    where a.plaid_item_id = ${itemId} and t.is_pending = 1
  `);
  const ids = stale.map((row) => row.id);
  if (!ids.length) return 0;

  await db.delete(transactions).where(inArray(transactions.splitParentId, ids));
  const deleted = await db
    .delete(transactions)
    .where(inArray(transactions.id, ids))
    .returning({ id: transactions.id });
  return deleted.length;
}

/**
 * Plaid returns TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION when the
 * transaction data changes while we are walking the sync pages. Each restart
 * replays from the last saved cursor, so cap the retries and let a persistent
 * failure surface instead of looping forever.
 */
const MAX_PAGINATION_RESTARTS = 3;

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
  // Cursor saved before this run. Plaid can invalidate an in-flight pagination
  // sequence when data changes underneath it; restarting from here is safe
  // because every page is applied idempotently (upsert on plaidTransactionId).
  const restartCursor = cursor;
  let paginationRestarts = 0;
  let hasMore = true;
  let addedCount = 0;

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountMap = new Map(dbAccounts.map((a) => [a.plaidAccountId, a.id]));
  const itemAccountIds = dbAccounts.map((account) => account.id);
  let existingDedupeRows = await loadExistingDedupeRows(db, userId, itemAccountIds);
  // Transactions whose Plaid account_id we do not have locally were silently
  // dropped here before. Plaid re-issues account ids on re-auth/institution
  // migrations, which orphans a local account and stops new rows for it from
  // ever importing. Collect them so the failure is visible.
  const unknownAccountIds = new Map<string, number>();
  let unknownAccountTxns = 0;
  let skippedDuplicateCount = 0;

  try {
    while (hasMore) {
      let page: Awaited<ReturnType<typeof plaidPost>>;
      try {
        page = await plaidPost("/transactions/sync", {
          access_token: accessToken,
          ...(cursor ? { cursor } : {}),
        });
      } catch (error) {
        if (
          isPlaidPaginationMutationError(error) &&
          paginationRestarts < MAX_PAGINATION_RESTARTS
        ) {
          paginationRestarts += 1;
          console.warn(
            `Plaid changed transaction data mid-pagination for item ${itemId}; ` +
              `restarting from the last saved cursor (attempt ${paginationRestarts}/${MAX_PAGINATION_RESTARTS})`,
          );
          cursor = restartCursor;
          hasMore = true;
          // The aborted attempt already wrote rows, so recount from scratch and
          // re-read the dedupe snapshot before replaying the pages.
          addedCount = 0;
          skippedDuplicateCount = 0;
          existingDedupeRows = await loadExistingDedupeRows(db, userId, itemAccountIds);
          continue;
        }
        throw error;
      }

      const removedPlaidTransactionIds = (page.removed ?? []).map(plaidTransactionId);
      const removedCount = await deletePlaidTransactions(db, removedPlaidTransactionIds);
      if (removedCount > 0) {
        // Deleted rows must also leave the dedupe snapshot, otherwise a
        // replacement re-issued with a new id can be rejected as a duplicate
        // of the row we just removed.
        existingDedupeRows = withoutRemovedTransactions(
          existingDedupeRows,
          removedPlaidTransactionIds,
        );
        console.log(`Removed ${removedCount} deleted Plaid transactions for item ${itemId}`);
      }

      for (const tx of page.added ?? []) {
        if (!isPostedTransaction(tx)) continue;
        if (accountMap.has((tx as any).account_id)) continue;
        const accountId = String((tx as any).account_id);
        unknownAccountIds.set(accountId, (unknownAccountIds.get(accountId) ?? 0) + 1);
        unknownAccountTxns += 1;
      }

      // Pending rows are skipped on purpose: they are replaced by a posted row
      // with a different transaction_id, and storing both is what used to make
      // the posted row look like a duplicate of its own pending twin.
      const incoming = (page.added ?? [])
        .filter((tx: any) => isPostedTransaction(tx) && accountMap.has(tx.account_id))
        .map((tx: any) => ({
          accountId: accountMap.get(tx.account_id)!,
          tx,
        }));
      const { kept, skipped } = filterDuplicateIncomingTransactions(
        existingDedupeRows,
        incoming,
      );
      skippedDuplicateCount += skipped;

      const upsertPosted = (accountId: number, tx: any) => {
        const values = plaidTransactionFields(tx, accountId);
        return db
          .insert(transactions)
          .values(values)
          .onConflictDoUpdate({
            target: transactions.plaidTransactionId,
            set: values,
          });
      };

      const inserted = await Promise.all(
        kept.map(({ accountId, tx }) => upsertPosted(accountId, tx)),
      );
      addedCount += inserted.length;

      // Upsert, not update: if Plaid ever flips pending -> posted on the same
      // transaction_id, there is no local pending row to update, so the row
      // has to be created here or the transaction would never appear.
      await Promise.all(
        (page.modified ?? [])
          .filter((tx: any) => isPostedTransaction(tx) && accountMap.has(tx.account_id))
          .map((tx: any) => upsertPosted(accountMap.get(tx.account_id)!, tx)),
      );

      cursor = page.next_cursor;
      hasMore = page.has_more;

      await db.update(plaidItems).set({ cursor }).where(eq(plaidItems.id, itemId));
    }

    if (unknownAccountTxns > 0) {
      console.warn(
        `[sync] item ${itemId}: dropped ${unknownAccountTxns} transaction(s) from ` +
          `${unknownAccountIds.size} Plaid account(s) missing locally: ` +
          [...unknownAccountIds.entries()]
            .map(([accountId, count]) => `${accountId} (${count})`)
            .join(", ") +
          ". Plaid may have re-issued account ids — re-link the item to repair.",
      );
    }

    console.log(
      `Sync completed for item ${itemId}. Total added: ${addedCount}` +
        (skippedDuplicateCount
          ? `, skipped ${skippedDuplicateCount} duplicate(s) (kept existing)`
          : ""),
    );
    await db.update(plaidItems).set({ lastSyncedAt: new Date() }).where(eq(plaidItems.id, itemId));
    const purgedCount = await purgePendingTransactions(db, itemId);
    if (purgedCount > 0) {
      console.log(`Removed ${purgedCount} stale pending transaction(s) for item ${itemId}`);
    }
    if (categorizeAfterSync) {
      // Rules only on sync — AI categorization is an explicit user action.
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

/**
 * Manual sync from the header button.
 *
 * Each Plaid item is synced independently so one broken bank login (e.g.
 * ITEM_LOGIN_REQUIRED) doesn't fail the whole run — we return per-item results
 * and let the UI show "N of M synced" plus which institutions need re-linking.
 */
export const manualSync = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });

  const results = await Promise.all(
    items.map(async (item) => {
      if (syncInFlight.has(item.id)) {
        return {
          itemId: item.id,
          institution: item.institutionName ?? `Item ${item.id}`,
          status: "skipped" as const,
        };
      }

      syncInFlight.add(item.id);
      try {
        await syncTransactions(item.accessToken, item.id, userId, false, false);
        return {
          itemId: item.id,
          institution: item.institutionName ?? `Item ${item.id}`,
          status: "synced" as const,
        };
      } catch (error) {
        const needsReconnect = isPlaidReconnectRequiredError(error);
        const envMismatch = isPlaidEnvMismatchError(error);
        const message = envMismatch
          ? "Plaid keys don't match this database's environment — run `bun run dev --production` locally, or check PLAID_ENV on Vercel."
          : error instanceof Error
            ? error.message
            : "Could not sync this institution.";
        return {
          itemId: item.id,
          institution: item.institutionName ?? `Item ${item.id}`,
          status: envMismatch
            ? ("config" as const)
            : needsReconnect
              ? ("reconnect" as const)
              : ("failed" as const),
          message,
        };
      } finally {
        syncInFlight.delete(item.id);
      }
    }),
  );

  return {
    total: items.length,
    synced: results.filter((r) => r.status === "synced").length,
    failures: results.filter((r) => r.status !== "synced" && r.status !== "skipped"),
  };
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
