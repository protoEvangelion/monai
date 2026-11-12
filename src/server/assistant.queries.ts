import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { accounts, categories, transactions } from "../db/schema";

/**
 * Read-only queries behind the assistant's tools.
 *
 * Kept provider-neutral: the pi agent registers TypeBox tool wrappers around
 * these, so the SQL is testable and reviewable without going through a model.
 */

/**
 * Amount sign convention in this database: Plaid's `amount` is stored as-is,
 * so money OUT (a purchase) is POSITIVE and money IN (income, refunds) is
 * NEGATIVE. Verified against Turso: November regular rows are all positive and
 * match the dashboard's "SPENT" figure.
 */
const MONEY_OUT = sql`${transactions.amount} > 0`;

function toDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ownedTransactions(userId: string) {
  // Transactions belong to the user through their account's Plaid item,
  // or directly for manual accounts (accounts.userId).
  return and(
    sql`(${accounts.userId} = ${userId} or exists (
      select 1 from plaid_items pi
      where pi.id = ${accounts.plaidItemId} and pi.user_id = ${userId}
    ))`,
    isNull(transactions.splitParentId),
  );
}

async function getDb() {
  const { db } = await import("../db");
  return db;
}

export type DateRange = {
  startDate: string;
  endDate: string;
  categoryName?: string;
};

export async function spendingByCategoryQuery(userId: string, input: DateRange) {
  const db = await getDb();
  const start = toDate(input.startDate);
  const end = toDate(input.endDate);

  const rows = await db
    .select({
      category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
      total: sql<number>`round(sum(${transactions.amount}), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ownedTransactions(userId),
        eq(transactions.transactionType, "regular"),
        MONEY_OUT,
        start ? gte(transactions.date, start) : undefined,
        end ? sql`${transactions.date} <= ${Math.floor(end.getTime() / 1000)}` : undefined,
        input.categoryName
          ? sql`lower(${categories.name}) = lower(${input.categoryName})`
          : undefined,
      ),
    )
    .groupBy(categories.name)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    total: Number(rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0).toFixed(2)),
    transactionCount: rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
    categories: rows.map((row) => ({
      category: row.category,
      amount: Number(Number(row.total ?? 0).toFixed(2)),
      count: Number(row.count ?? 0),
    })),
  };
}

export async function topMerchantsQuery(userId: string, input: DateRange) {
  const db = await getDb();
  const start = toDate(input.startDate);
  const end = toDate(input.endDate);

  const rows = await db
    .select({
      merchant: transactions.merchantName,
      total: sql<number>`round(sum(${transactions.amount}), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        ownedTransactions(userId),
        eq(transactions.transactionType, "regular"),
        MONEY_OUT,
        start ? gte(transactions.date, start) : undefined,
        end ? sql`${transactions.date} <= ${Math.floor(end.getTime() / 1000)}` : undefined,
        input.categoryName
          ? sql`exists (select 1 from categories c2 where c2.id = ${transactions.categoryId} and lower(c2.name) = lower(${input.categoryName}))`
          : undefined,
      ),
    )
    .groupBy(transactions.merchantName)
    .orderBy(desc(sql`sum(${transactions.amount})`))
    .limit(10);

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    merchants: rows.map((row) => ({
      merchant: row.merchant,
      amount: Number(Number(row.total ?? 0).toFixed(2)),
      count: Number(row.count ?? 0),
    })),
  };
}

export async function searchTransactionsQuery(
  userId: string,
  input: { query: string; limit?: number },
) {
  const db = await getDb();
  const needle = `%${input.query.toLowerCase()}%`;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      merchant: transactions.merchantName,
      amount: transactions.amount,
      category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ownedTransactions(userId),
        sql`(lower(${transactions.merchantName}) like ${needle} or lower(coalesce(${transactions.note}, '')) like ${needle})`,
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(input.limit ?? 20);

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      merchant: row.merchant,
      amount: Number(Number(row.amount ?? 0).toFixed(2)),
      category: row.category,
      note: row.note ?? null,
    })),
  };
}

export async function accountOverviewQuery(userId: string) {
  const db = await getDb();

  const rows = await db
    .select({
      name: accounts.name,
      type: accounts.type,
      balance: accounts.currentBalance,
    })
    .from(accounts)
    .where(
      sql`${accounts.userId} = ${userId} or exists (
        select 1 from plaid_items pi
        where pi.id = ${accounts.plaidItemId} and pi.user_id = ${userId}
      )`,
    )
    .orderBy(desc(accounts.currentBalance));

  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + Number(row.balance ?? 0));
  }

  return {
    accounts: rows.map((row) => ({
      name: row.name,
      type: row.type,
      balance: Number(Number(row.balance ?? 0).toFixed(2)),
    })),
    byType: [...byType.entries()].map(([type, balance]) => ({
      type,
      balance: Number(balance.toFixed(2)),
    })),
  };
}

export async function monthlyTrendQuery(userId: string, input: { months?: number }) {
  const db = await getDb();
  const monthLimit = input.months ?? 6;

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`,
      spend: sql<number>`round(coalesce(sum(case when ${MONEY_OUT} and ${transactions.transactionType} = 'regular' then ${transactions.amount} else 0 end), 0), 2)`,
      income: sql<number>`round(coalesce(sum(case when ${transactions.transactionType} = 'income' then -${transactions.amount} else 0 end), 0), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(ownedTransactions(userId))
    .groupBy(sql`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`)
    .orderBy(desc(sql`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`))
    .limit(monthLimit);

  return {
    months: rows.map((row) => ({
      month: row.month,
      spend: Number(row.spend ?? 0),
      income: Number(row.income ?? 0),
      count: Number(row.count ?? 0),
    })),
  };
}
