import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { accounts, historicalBalances, plaidItems } from "../db/schema";

const isDebtType = (type: string) => type === "credit" || type === "loan";

const toDayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const dayKeyToDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const LOOKBACK_MS = 24 * 30 * 24 * 60 * 60 * 1000; // ~24 months

async function getUserAccounts(db: typeof import("../db").db, userId: string) {
  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: { with: { historicalBalances: true } } },
  });

  const plaidAccounts = items.flatMap((item) => item.accounts);
  const manualAccounts = await db.query.accounts.findMany({
    where: and(eq(accounts.userId, userId), isNull(accounts.plaidItemId)),
    with: { historicalBalances: true },
  });

  return [...plaidAccounts, ...manualAccounts];
}

export const getAccounts = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");
  const userAccounts = await getUserAccounts(db, userId);
  return userAccounts.map(({ historicalBalances: _history, ...account }) => account);
});

export const getConnections = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });

  return items.map((item) => ({
    id: item.id,
    institutionName: item.institutionName,
    lastSyncedAt: item.lastSyncedAt,
    accountCount: item.accounts.length,
  }));
});

export const createRealEstateAccount = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (ctx as any).data as { name?: string; value?: number };
  const name = data.name?.trim() || "Home";
  const value = Math.max(0, Number(data.value) || 0);

  const [account] = await db
    .insert(accounts)
    .values({
      name,
      type: "real_estate",
      currentBalance: value,
      userId,
      plaidItemId: null,
      plaidAccountId: null,
    })
    .returning();

  await db.insert(historicalBalances).values({
    accountId: account.id,
    date: new Date(),
    balance: value,
    source: "manual",
  });

  return account;
});

export const updateRealEstateAccount = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (ctx as any).data as { id: number; name?: string; value?: number };

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, data.id),
  });

  if (
    !account ||
    account.type !== "real_estate" ||
    account.plaidItemId != null ||
    account.userId !== userId
  ) {
    throw new Error("Home asset not found");
  }

  const name = data.name?.trim() || account.name;
  const value =
    data.value === undefined ? account.currentBalance : Math.max(0, Number(data.value) || 0);
  const valueChanged = value !== account.currentBalance;

  await db
    .update(accounts)
    .set({ name, currentBalance: value })
    .where(eq(accounts.id, account.id));

  if (valueChanged) {
    await db.insert(historicalBalances).values({
      accountId: account.id,
      date: new Date(),
      balance: value,
      source: "manual",
    });
  }

  return { id: account.id, name, currentBalance: value };
});

export const getNetWorthHistory = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");
  const userAccounts = await getUserAccounts(db, userId);

  const now = new Date();
  const cutoff = now.getTime() - LOOKBACK_MS;
  const todayKey = toDayKey(now);

  // Every calendar day that has at least one stored balance observation
  const dayKeys = new Set<string>();
  for (const account of userAccounts) {
    for (const point of account.historicalBalances) {
      const d = new Date(point.date);
      if (d.getTime() < cutoff) continue;
      dayKeys.add(toDayKey(d));
    }
  }
  dayKeys.add(todayKey);

  const sortedDays = [...dayKeys].sort();
  if (!sortedDays.length) return [];

  type DayBucket = { assets: number; debts: number };
  const totals = new Map<string, DayBucket>(
    sortedDays.map((key) => [key, { assets: 0, debts: 0 }]),
  );

  for (const account of userAccounts) {
    // Latest observation per day for this account
    const byDay = new Map<string, { at: number; balance: number }>();
    for (const point of account.historicalBalances) {
      const d = new Date(point.date);
      if (d.getTime() < cutoff) continue;
      const key = toDayKey(d);
      const at = d.getTime();
      const prev = byDay.get(key);
      if (!prev || at >= prev.at) byDay.set(key, { at, balance: point.balance });
    }

    // Always reflect live balance on today
    byDay.set(todayKey, { at: now.getTime(), balance: account.currentBalance });

    let lastBalance: number | null = null;
    for (const key of sortedDays) {
      const observed = byDay.get(key);
      if (observed) lastBalance = observed.balance;
      if (lastBalance === null) continue;

      const bucket = totals.get(key)!;
      if (isDebtType(account.type)) bucket.debts += Math.abs(lastBalance);
      else bucket.assets += lastBalance;
    }
  }

  const history = sortedDays.map((key) => {
    const { assets, debts } = totals.get(key) ?? { assets: 0, debts: 0 };
    const date = dayKeyToDate(key);
    return {
      monthKey: key.slice(0, 7),
      dayKey: key,
      date,
      dateLabel: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      assets: Math.round(assets),
      debts: Math.round(debts),
      netWorth: Math.round(assets - debts),
    };
  });

  const firstDataIndex = history.findIndex((point) => point.assets !== 0 || point.debts !== 0);
  return firstDataIndex === -1 ? [] : history.slice(firstDataIndex);
});
