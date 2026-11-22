/**
 * Re-import Plaid transactions the sync silently dropped.
 *
 * Background: the sync used to store pending transactions. When one posted,
 * Plaid sent removed(pending_id) + added(posted_id); the pending row was
 * deleted, but the dedupe snapshot still claimed the posted row as a duplicate
 * of it, so the posted row was skipped and the transaction vanished for good
 * (the sync cursor had already moved past it).
 *
 * This script asks Plaid for the authoritative transaction set, diffs it
 * against the local table by plaid_transaction_id, and re-inserts what is
 * genuinely missing. It is deliberately conservative: a row is skipped when a
 * stored row already has the same amount and vendor within one day (the
 * reconnect-duplicate case).
 *
 * Usage (dry run is the default):
 *   bun scripts/backfill-dropped-transactions.ts
 *   bun scripts/backfill-dropped-transactions.ts --apply
 *
 * Options:
 *   --apply              write the missing rows (default: report only)
 *   --production         use PLAID_PRODUCTION_ENV / PLAID_PRODUCTION_SECRET
 *   --item <id>          only this plaid_items.id
 *   --since YYYY-MM-DD   how far back to ask Plaid (default: 60 days)
 *   --keep-pending       do not delete leftover pending rows on --apply
 *
 * Needs the app's env: PLAID_CLIENT_ID + PLAID_PRODUCTION_SECRET (or
 * PLAID_SECRET), and MONAI_DATABASE_URL / TURSO_DATABASE_URL / DATABASE_URL.
 * Only reads from Plaid.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { accounts, categorizationRules, plaidItems, transactions } from "../src/db/schema";
import { plaidPost, resolvePlaidCredentials } from "../src/server/plaid.utils";
import { amountCents, utcDayMs, vendorsMatch } from "../src/server/transactions.dedupe";
import { ruleMatches } from "../src/server/rules.match";

const args = Bun.argv.slice(2);
const apply = args.includes("--apply");
const keepPending = args.includes("--keep-pending");
const flagValue = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const itemFilter = flagValue("--item") ? Number(flagValue("--item")) : null;
const sinceArg = flagValue("--since");

// Real bank tokens only work against production Plaid, exactly like
// `bun run dev --production` does for the app.
if (args.includes("--production")) {
  process.env.PLAID_ENV = process.env.PLAID_PRODUCTION_ENV ?? "production";
  process.env.PLAID_SECRET = process.env.PLAID_PRODUCTION_SECRET ?? process.env.PLAID_SECRET;
}

const DAY_MS = 86_400_000;

type PlaidTransaction = {
  account_id: string;
  amount: number;
  authorized_date?: string | null;
  authorized_datetime?: string | null;
  date: string;
  datetime?: string | null;
  transaction_id: string;
  name: string;
  merchant_name?: string | null;
  location?: { address?: string | null } | null;
  pending: boolean;
  recurring_transaction_id?: string | null;
};

type StoredRow = {
  accountId: number;
  plaidTransactionId: string | null;
  amount: number;
  date: Date;
  vendor: string;
  isPending: boolean;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const plaidDate = (tx: PlaidTransaction) => new Date(tx.authorized_date ?? tx.date);
const label = (tx: PlaidTransaction) => tx.merchant_name ?? tx.name;

/** Plaid caps /transactions/get at 500 rows per page. */
async function fetchPlaidTransactions({
  accessToken,
  startDate,
  endDate,
}: {
  accessToken: string;
  startDate: string;
  endDate: string;
}) {
  const all: PlaidTransaction[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const page = await plaidPost("/transactions/get", {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset },
    });
    const batch = (page.transactions ?? []) as PlaidTransaction[];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

async function loadStoredRows(userId: string) {
  const rows = await db.all<{
    account_id: number;
    plaid_transaction_id: string | null;
    amount: number;
    date: number | Date;
    merchant_name: string | null;
    name: string | null;
    is_pending: number;
  }>(sql`
    select t.account_id as account_id, t.plaid_transaction_id as plaid_transaction_id,
      t.amount as amount, t.date as date, t.merchant_name as merchant_name,
      t.name as name, t.is_pending as is_pending
    from transactions t
    join accounts a on a.id = t.account_id
    left join plaid_items p on p.id = a.plaid_item_id
    where (p.user_id = ${userId} or a.user_id = ${userId})
  `);

  return rows.map<StoredRow>((row) => ({
    accountId: row.account_id,
    plaidTransactionId: row.plaid_transaction_id,
    amount: row.amount,
    date: row.date instanceof Date ? row.date : new Date(Number(row.date) * 1000),
    vendor: row.merchant_name || row.name || "",
    isPending: Boolean(row.is_pending),
  }));
}

function sameMoneyVendorDay(
  left: { amount: number; date: Date; vendor: string },
  right: { amount: number; date: Date; vendor: string },
) {
  if (amountCents(left.amount) !== amountCents(right.amount)) return false;
  if (!vendorsMatch(left.vendor, right.vendor)) return false;
  return Math.abs(utcDayMs(left.date) - utcDayMs(right.date)) <= DAY_MS;
}

async function applyRules(userId: string, transactionIds: number[]) {
  if (!transactionIds.length) return 0;

  const rules = await db.query.categorizationRules.findMany({
    where: eq(categorizationRules.userId, userId),
    orderBy: [desc(categorizationRules.id)],
  });
  if (!rules.length) return 0;

  const rows = await db.query.transactions.findMany({
    where: inArray(transactions.id, transactionIds),
  });

  let updated = 0;
  for (const row of rows) {
    const rule = rules.find((candidate) =>
      ruleMatches(candidate, {
        merchantName: row.merchantName,
        name: row.name,
        amount: row.amount,
      }),
    );
    if (!rule) continue;
    await db
      .update(transactions)
      .set({
        ruleId: rule.id,
        categoryId: rule.transactionType === "regular" ? rule.categoryId : null,
        transactionType: rule.transactionType,
      })
      .where(eq(transactions.id, row.id));
    updated += 1;
  }
  return updated;
}

async function purgePending(accountIds: number[]) {
  if (keepPending || !accountIds.length) return 0;
  const stale = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(inArray(transactions.accountId, accountIds), eq(transactions.isPending, true)));
  if (!stale.length) return 0;

  const ids = stale.map((row) => row.id);
  await db.delete(transactions).where(inArray(transactions.splitParentId, ids));
  const deleted = await db
    .delete(transactions)
    .where(inArray(transactions.id, ids))
    .returning({ id: transactions.id });
  return deleted.length;
}

const credentials = resolvePlaidCredentials();
if (!credentials.clientId || !credentials.secret) {
  console.error("Missing Plaid credentials: need PLAID_CLIENT_ID and PLAID_SECRET.");
  process.exit(1);
}

const items = await db.query.plaidItems.findMany({
  where: itemFilter ? eq(plaidItems.id, itemFilter) : undefined,
  with: { accounts: true },
});

if (!items.length) {
  console.log("No Plaid items to backfill.");
  process.exit(0);
}

console.log(
  `Backfill ${apply ? "(APPLY)" : "(dry run)"} against ${credentials.env} Plaid, ` +
    `${items.length} item(s).`,
);

let totalMissing = 0;
let totalInserted = 0;
let totalSkipped = 0;
let totalPurged = 0;

for (const item of items) {
  if (!item.accounts.length) continue;

  const accountIdByPlaidId = new Map(
    item.accounts.map((account) => [account.plaidAccountId, account.id]),
  );
  const accountNameById = new Map(item.accounts.map((account) => [account.id, account.name]));
  const itemAccountIds = new Set(item.accounts.map((account) => account.id));
  const stored = await loadStoredRows(item.userId);
  const itemStored = stored.filter((row) => itemAccountIds.has(row.accountId));

  // Default window is deliberately short: the pending-twin bug only started
  // dropping rows once the sync stored pending transactions, and re-importing
  // years of history would rewrite reports.
  const startDate = sinceArg ?? isoDay(new Date(Date.now() - 60 * DAY_MS));
  const endDate = isoDay(new Date());

  console.log(`\n[item ${item.id}] ${item.institutionName ?? "unknown"} (${startDate} .. ${endDate})`);

  let plaidTransactions: PlaidTransaction[];
  try {
    plaidTransactions = await fetchPlaidTransactions({
      accessToken: item.accessToken,
      startDate,
      endDate,
    });
  } catch (error) {
    console.warn(`  skipped: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const storedIds = new Set(
    stored
      .map((row) => row.plaidTransactionId)
      .filter((value): value is string => Boolean(value)),
  );

  const missing: Array<{ accountId: number; tx: PlaidTransaction }> = [];
  const skipped: Array<{ tx: PlaidTransaction; reason: string }> = [];

  for (const tx of plaidTransactions) {
    const accountId = accountIdByPlaidId.get(tx.account_id);
    if (!accountId) continue;
    if (tx.pending) continue;
    if (storedIds.has(tx.transaction_id)) continue;

    const candidate = {
      accountId,
      amount: tx.amount,
      date: plaidDate(tx),
      vendor: String(label(tx) ?? ""),
    };

    if (itemStored.some((row) => sameMoneyVendorDay(row, candidate))) {
      skipped.push({ tx, reason: "same amount + vendor within 1 day already stored" });
      continue;
    }
    if (missing.some((prior) => sameMoneyVendorDay(candidate, {
      amount: prior.tx.amount,
      date: plaidDate(prior.tx),
      vendor: String(label(prior.tx) ?? ""),
    }))) {
      skipped.push({ tx, reason: "duplicate inside this backfill batch" });
      continue;
    }

    missing.push({ accountId, tx });
  }

  missing.sort((a, b) => plaidDate(a.tx).getTime() - plaidDate(b.tx).getTime());

  console.log(
    `  plaid rows: ${plaidTransactions.length}, missing: ${missing.length}, ` +
      `skipped as duplicates: ${skipped.length}`,
  );
  for (const { accountId, tx } of missing) {
    console.log(
      `   + ${isoDay(plaidDate(tx))} ${tx.amount.toFixed(2).padStart(9)} ` +
        `${String(label(tx)).slice(0, 40).padEnd(40)} ${accountNameById.get(accountId) ?? accountId}`,
    );
  }
  for (const { tx, reason } of skipped) {
    console.log(
      `   ~ ${isoDay(plaidDate(tx))} ${tx.amount.toFixed(2).padStart(9)} ` +
        `${String(label(tx)).slice(0, 40).padEnd(40)} ${reason}`,
    );
  }

  totalMissing += missing.length;
  totalSkipped += skipped.length;

  if (apply && missing.length) {
    const insertedIds: number[] = [];
    for (const { accountId, tx } of missing) {
      const inserted = await db
        .insert(transactions)
        .values({
          accountId,
          plaidTransactionId: tx.transaction_id,
          amount: tx.amount,
          date: plaidDate(tx),
          datetime: tx.authorized_datetime ?? tx.datetime
            ? new Date((tx.authorized_datetime ?? tx.datetime) as string)
            : null,
          name: tx.name,
          merchantName: tx.merchant_name ?? tx.name,
          location: tx.location?.address ?? null,
          isRecurring: tx.recurring_transaction_id != null,
          isPending: false,
          isReviewed: false,
          transactionType: "regular",
        })
        .onConflictDoNothing({ target: transactions.plaidTransactionId })
        .returning({ id: transactions.id });
      if (inserted[0]) insertedIds.push(inserted[0].id);
    }

    const ruled = await applyRules(item.userId, insertedIds).catch((error) => {
      console.warn(`  rule application failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    });
    console.log(`  inserted ${insertedIds.length} row(s), ${ruled} categorized by rules`);
    totalInserted += insertedIds.length;
  }

  if (apply) {
    const purged = await purgePending([...itemAccountIds]);
    if (purged) console.log(`  removed ${purged} leftover pending row(s)`);
    totalPurged += purged;
  }
}

console.log(
  `\n${apply ? "Inserted" : "Would insert"}: ${apply ? totalInserted : totalMissing} row(s); ` +
    `skipped duplicates: ${totalSkipped}; purged pending: ${totalPurged}.`,
);
if (!apply) console.log("Re-run with --apply to write these rows.");
process.exit(0);
