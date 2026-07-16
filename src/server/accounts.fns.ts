import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { accounts, historicalBalances, plaidItems } from "../db/schema";

const isDebtType = (type: string) => type === "credit" || type === "loan";

const toMonthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const monthKey = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

const last24MonthKeys = (): string[] => {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) =>
    monthKey(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (23 - i), 1)).getUTCFullYear(),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (23 - i), 1)).getUTCMonth(),
    ),
  );
};

const keyToDate = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
};

type MonthBucket = { assets: number; debts: number };

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

  const monthKeys = last24MonthKeys();
  const validKeys = new Set(monthKeys);

  const totals = userAccounts.reduce<Map<string, MonthBucket>>((acc, account) => {
    const latestForMonth = account.historicalBalances.reduce<
      Map<string, { date: number; balance: number }>
    >((map, point) => {
      const d = new Date(point.date);
      const key = toMonthKey(d);
      if (!validKeys.has(key)) return map;
      const prev = map.get(key);
      if (!prev || d.getTime() > prev.date) map.set(key, { date: d.getTime(), balance: point.balance });
      return map;
    }, new Map());

    // Forward-fill current balance into latest month when no history exists yet
    if (latestForMonth.size === 0) {
      const currentKey = toMonthKey(new Date());
      if (validKeys.has(currentKey)) {
        latestForMonth.set(currentKey, {
          date: Date.now(),
          balance: account.currentBalance,
        });
      }
    }

    latestForMonth.forEach(({ balance }, key) => {
      const bucket = acc.get(key) ?? { assets: 0, debts: 0 };
      if (isDebtType(account.type)) bucket.debts += Math.abs(balance);
      else bucket.assets += balance;
      acc.set(key, bucket);
    });

    return acc;
  }, new Map(monthKeys.map((k) => [k, { assets: 0, debts: 0 }])));

  return monthKeys.map((key) => {
    const { assets, debts } = totals.get(key) ?? { assets: 0, debts: 0 };
    const date = keyToDate(key);
    return {
      monthKey: key,
      date,
      dateLabel: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      assets: Math.round(assets),
      debts: Math.round(debts),
      netWorth: Math.round(assets - debts),
    };
  });
});
