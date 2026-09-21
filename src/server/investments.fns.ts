import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { accounts, plaidItems } from "../db/schema";

const LOOKBACK_MS = 24 * 30 * 24 * 60 * 60 * 1000;

const toDayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const dayKeyToDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

function formatSecurityType(type: string | null | undefined) {
  if (!type) return "Other";
  return type
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function gainPercent(value: number, costBasis: number | null | undefined) {
  if (costBasis == null || costBasis === 0) return null;
  return ((value - costBasis) / Math.abs(costBasis)) * 100;
}

function isSandboxInvestmentAccount(name: string, institutionName: string | null) {
  if (/^plaid\b/i.test(name.trim())) return true;
  if ((institutionName ?? "").toLowerCase() === "tartan bank") return true;
  return false;
}

type HistoryPoint = {
  dayKey: string;
  monthKey: string;
  date: Date;
  dateLabel: string;
  balance: number;
};

function buildDailyHistory(
  historicalBalances: Array<{ date: Date | string; balance: number }>,
  currentBalance: number,
  sharedDayKeys: string[],
): HistoryPoint[] {
  const now = new Date();
  const cutoff = now.getTime() - LOOKBACK_MS;
  const todayKey = toDayKey(now);

  const byDay = new Map<string, { at: number; balance: number }>();
  for (const point of historicalBalances) {
    const d = new Date(point.date);
    if (d.getTime() < cutoff) continue;
    const key = toDayKey(d);
    const at = d.getTime();
    const prev = byDay.get(key);
    if (!prev || at >= prev.at) byDay.set(key, { at, balance: point.balance });
  }
  byDay.set(todayKey, { at: now.getTime(), balance: currentBalance });

  const firstKey = [...byDay.keys()].sort()[0];
  if (!firstKey) return [];

  const dayKeys = sharedDayKeys.length
    ? sharedDayKeys.filter((key) => key >= firstKey)
    : [...new Set([...byDay.keys()])].sort();

  let lastBalance: number | null = null;
  const history: HistoryPoint[] = [];
  for (const key of dayKeys) {
    const observed = byDay.get(key);
    if (observed) lastBalance = observed.balance;
    if (lastBalance === null) continue;
    const date = dayKeyToDate(key);
    history.push({
      dayKey: key,
      monthKey: key.slice(0, 7),
      date,
      dateLabel: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      balance: Math.round(lastBalance * 100) / 100,
    });
  }
  return history;
}

function changePercent(history: HistoryPoint[]) {
  if (history.length < 2) return null;
  const first = history[0]!.balance;
  const last = history[history.length - 1]!.balance;
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  // Guard against junk from account-set changes / missing history
  if (!Number.isFinite(pct) || Math.abs(pct) > 200) return null;
  return pct;
}

export const getInvestmentsDashboard = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: {
      accounts: {
        with: {
          historicalBalances: true,
          holdings: { with: { security: true } },
        },
      },
    },
  });

  const manualAccounts = await db.query.accounts.findMany({
    where: and(
      eq(accounts.userId, userId),
      isNull(accounts.plaidItemId),
      eq(accounts.type, "investment"),
    ),
    with: {
      historicalBalances: true,
      holdings: { with: { security: true } },
    },
  });

  const investmentAccounts = [
    ...items.flatMap((item) =>
      item.accounts
        .filter((account) => account.type === "investment")
        .map((account) => ({
          ...account,
          lastSyncedAt: item.lastSyncedAt,
          institutionName: item.institutionName,
        })),
    ),
    ...manualAccounts.map((account) => ({
      ...account,
      lastSyncedAt: null as Date | null,
      institutionName: null as string | null,
    })),
  ]
    .filter((account) => !isSandboxInvestmentAccount(account.name, account.institutionName))
    .sort((a, b) => b.currentBalance - a.currentBalance);

  const now = new Date();
  const cutoff = now.getTime() - LOOKBACK_MS;
  const todayKey = toDayKey(now);
  const allDayKeys = new Set<string>([todayKey]);
  for (const account of investmentAccounts) {
    for (const point of account.historicalBalances) {
      const d = new Date(point.date);
      if (d.getTime() < cutoff) continue;
      allDayKeys.add(toDayKey(d));
    }
  }
  const sortedDays = [...allDayKeys].sort();

  const accountsOut = investmentAccounts.map((account) => {
    const history = buildDailyHistory(
      account.historicalBalances,
      account.currentBalance,
      sortedDays,
    );

    const accountHoldings = [...account.holdings]
      .map((holding) => {
        const value = holding.institutionValue;
        const cost = holding.costBasis;
        return {
          id: holding.id,
          quantity: holding.quantity,
          institutionPrice: holding.institutionPrice ?? holding.security.closePrice,
          institutionValue: value,
          costBasis: cost,
          gainPercent: gainPercent(value, cost),
          asOf: holding.asOf,
          security: {
            id: holding.security.id,
            name: holding.security.name,
            tickerSymbol: holding.security.tickerSymbol,
            type: holding.security.type,
            typeLabel: formatSecurityType(holding.security.type),
          },
        };
      })
      .sort((a, b) => b.institutionValue - a.institutionValue);

    const holdingsTotal = accountHoldings.reduce(
      (sum, holding) => sum + holding.institutionValue,
      0,
    );
    const allocationMap = new Map<string, number>();
    for (const holding of accountHoldings) {
      const label = holding.security.typeLabel;
      allocationMap.set(label, (allocationMap.get(label) ?? 0) + holding.institutionValue);
    }
    const allocations = [...allocationMap.entries()]
      .map(([label, value]) => ({
        label,
        value,
        percent: holdingsTotal > 0 ? (value / holdingsTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const firstObserved = account.historicalBalances
      .map((point) => toDayKey(new Date(point.date)))
      .sort()[0];

    return {
      id: account.id,
      name: account.name,
      currentBalance: account.currentBalance,
      lastSyncedAt: account.lastSyncedAt,
      institutionName: account.institutionName,
      history,
      changePercent: changePercent(history),
      sparkline: history.slice(-14).map((point) => point.balance),
      holdings: accountHoldings,
      allocations,
      holdingsTotal,
      firstObservedDay: firstObserved ?? todayKey,
    };
  });

  const totalBalance = accountsOut.reduce((sum, account) => sum + account.currentBalance, 0);

  // Start portfolio chart when every material account (>1% of total) has history —
  // avoids months of $30k then a fake +700% spike when Fidelity appears.
  const materialAccounts = accountsOut.filter(
    (account) => totalBalance > 0 && account.currentBalance / totalBalance >= 0.01,
  );
  const comparableStart =
    materialAccounts.length > 0
      ? materialAccounts
          .map((account) => account.firstObservedDay)
          .sort()
          .at(-1)!
      : sortedDays[0];

  const portfolioHistory: HistoryPoint[] = [];
  for (const key of sortedDays) {
    if (comparableStart && key < comparableStart) continue;
    let balance = 0;
    let included = 0;
    for (const account of accountsOut) {
      const point = account.history.find((row) => row.dayKey === key);
      if (!point) continue;
      balance += point.balance;
      included += 1;
    }
    if (included === 0) continue;
    const date = dayKeyToDate(key);
    portfolioHistory.push({
      dayKey: key,
      monthKey: key.slice(0, 7),
      date,
      dateLabel: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      balance: Math.round(balance),
    });
  }

  const allHoldings = accountsOut.flatMap((account) =>
    account.holdings.map((holding) => ({
      ...holding,
      accountId: account.id,
      accountName: account.name,
    })),
  );
  const topMovers = [...allHoldings]
    .filter((holding) => holding.gainPercent != null && Math.abs(holding.institutionValue) > 1)
    .sort((a, b) => Math.abs(b.gainPercent!) - Math.abs(a.gainPercent!))
    .slice(0, 6);

  return {
    totalBalance,
    changePercent: changePercent(portfolioHistory),
    history: portfolioHistory,
    accounts: accountsOut.map(({ firstObservedDay: _, ...account }) => account),
    topMovers,
    hasHoldings: allHoldings.length > 0,
  };
});

export const syncInvestmentsNow = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");
  const { syncInvestmentsHoldings } = await import("./plaid.investments.fns");
  const { refreshAccountBalances } = await import("./plaid.utils");
  const { historicalBalances } = await import("../db/schema");

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const results = await Promise.all(
    items.map(async (item) => {
      try {
        await refreshAccountBalances(item.accessToken, item.id).catch(() => 0);
        const result = await syncInvestmentsHoldings(item.accessToken, item.id);
        const itemAccounts = await db.query.accounts.findMany({
          where: eq(accounts.plaidItemId, item.id),
        });
        await Promise.all(
          itemAccounts.map((acct) =>
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
        return result;
      } catch (error) {
        console.warn(`[investments] sync failed for item ${item.id}:`, error);
        return { synced: false as const, holdingCount: 0 };
      }
    }),
  );

  return {
    itemCount: items.length,
    syncedItemCount: results.filter((result) => result.synced).length,
    holdingCount: results.reduce((sum, result) => sum + result.holdingCount, 0),
  };
});
