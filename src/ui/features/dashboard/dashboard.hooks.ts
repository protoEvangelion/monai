import { useEffect, useMemo, useRef, useState } from "react";
import { centsToDollars, getMonthKey } from "../categories/categories.utils";
import type {
  DashboardAccountsData,
  DashboardBudgetsData,
  DashboardCategoriesData,
  DashboardNetWorthData,
  DashboardTransactionsData,
} from "./dashboard.types";

const chartDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function useDashboardMetrics({
  categories,
  transactions,
  accounts,
  netWorthHistory,
  budgets,
  viewDate,
}: {
  categories: DashboardCategoriesData;
  transactions: DashboardTransactionsData;
  accounts: DashboardAccountsData;
  netWorthHistory: DashboardNetWorthData;
  budgets: DashboardBudgetsData;
  viewDate: string;
}) {
  return useMemo(() => {
    const viewMonth = new Date(viewDate);
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const today = new Date();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthTxns = transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const monthKey = getMonthKey(viewDate);
    const monthlyBudget = budgets.find((budget) => budget.month === monthKey);
    const allocationByCategoryId = new Map(
      (monthlyBudget?.allocations ?? []).map((allocation) => [
        allocation.categoryId,
        centsToDollars(allocation.amountCents),
      ]),
    );
    const incomeCategoryIds = new Set<number>();
    categories
      .filter((group) => group.name.toLowerCase() === "income")
      .forEach((group) => group.children.forEach((child) => incomeCategoryIds.add(child.id)));

    const expenseGroups = categories.filter((group) => group.name.toLowerCase() !== "income");
    const totalBudgeted = expenseGroups.reduce(
      (sum, group) =>
        sum +
        group.children.reduce(
          (childSum, child) =>
            childSum + (allocationByCategoryId.get(child.id) ?? child.budgetAmount),
          0,
        ),
      0,
    );
    const budgetableMonthTxns = monthTxns.filter((tx) => tx.transactionType !== "transfer");

    const totalSpent = budgetableMonthTxns
      .filter(
        (tx) =>
          tx.transactionType === "regular" &&
          tx.amount > 0 &&
          (!tx.categoryId || !incomeCategoryIds.has(tx.categoryId)),
      )
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalLeft = totalBudgeted - totalSpent;
    const expectedIncome = centsToDollars(monthlyBudget?.expectedIncomeCents ?? 0);
    const remainingToAssignCents =
      (monthlyBudget?.expectedIncomeCents ?? 0) - Math.round(totalBudgeted * 100);
    const actualIncome = budgetableMonthTxns
      .filter(
        (tx) =>
          tx.transactionType === "income" ||
          (tx.categoryId && incomeCategoryIds.has(tx.categoryId)),
      )
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;

    const totalAssets = accounts
      .filter((account) => ["cash", "investment"].includes(account.type))
      .reduce((sum, account) => sum + account.currentBalance, 0);
    const totalDebts = accounts
      .filter((account) => ["credit", "loan"].includes(account.type))
      .reduce((sum, account) => sum + Math.abs(account.currentBalance), 0);
    const netWorth = totalAssets - totalDebts;

    const accountTypeById = new Map(accounts.map((account) => [account.id, account.type]));
    const { dailyAssetDelta, dailyDebtDelta } = monthTxns.reduce(
      (acc, tx) => {
        const day = new Date(tx.date).getDate();
        const accountType = accountTypeById.get(tx.accountId);
        if (accountType === "cash" || accountType === "investment") {
          acc.dailyAssetDelta[day] = (acc.dailyAssetDelta[day] || 0) - tx.amount;
        }
        if (accountType === "credit" || accountType === "loan") {
          acc.dailyDebtDelta[day] = (acc.dailyDebtDelta[day] || 0) + tx.amount;
        }
        return acc;
      },
      {
        dailyAssetDelta: {} as Record<number, number>,
        dailyDebtDelta: {} as Record<number, number>,
      },
    );

    const totalMonthAssetDelta = Object.values(dailyAssetDelta).reduce(
      (sum, value) => sum + value,
      0,
    );
    const totalMonthDebtDelta = Object.values(dailyDebtDelta).reduce(
      (sum, value) => sum + value,
      0,
    );

    const currentMonthNetWorthChartData = Array.from({ length: lastDay }, (_, i) => i + 1).reduce(
      (acc, day) => {
        const date = new Date(year, month, day);
        acc.runningAssets += dailyAssetDelta[day] || 0;
        acc.runningDebts += dailyDebtDelta[day] || 0;
        const currentMonthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        acc.points.push({
          day,
          monthKey: currentMonthKey,
          date,
          dateLabel: chartDateFormatter.format(date),
          assets: Math.round(acc.runningAssets),
          debts: Math.round(acc.runningDebts),
          netWorth: Math.round(acc.runningAssets - acc.runningDebts),
        });
        return acc;
      },
      {
        runningAssets: totalAssets - totalMonthAssetDelta,
        runningDebts: totalDebts - totalMonthDebtDelta,
        points: [] as Array<{
          day: number;
          monthKey: string;
          date: Date;
          dateLabel: string;
          assets: number;
          debts: number;
          netWorth: number;
        }>,
      },
    ).points;

    const netWorthChartData = netWorthHistory.some(
      (point) => point.assets !== 0 || point.debts !== 0,
    )
      ? netWorthHistory
      : currentMonthNetWorthChartData;

    const { catSpend, catCount } = budgetableMonthTxns.reduce(
      (acc, tx) => {
        if (
          tx.category &&
          tx.transactionType === "regular" &&
          tx.amount > 0 &&
          !incomeCategoryIds.has(tx.category.id)
        ) {
          acc.catSpend[tx.category.id] = (acc.catSpend[tx.category.id] || 0) + tx.amount;
          acc.catCount[tx.category.id] = (acc.catCount[tx.category.id] || 0) + 1;
        }
        return acc;
      },
      {
        catSpend: {} as Record<number, number>,
        catCount: {} as Record<number, number>,
      },
    );

    const topGroups = expenseGroups
      .map((group) => ({
        id: group.id,
        name: group.name,
        icon: group.icon,
        totalSpent: group.children.reduce((sum, child) => sum + (catSpend[child.id] || 0), 0),
        totalBudget: group.children.reduce(
          (sum, child) => sum + (allocationByCategoryId.get(child.id) ?? child.budgetAmount),
          0,
        ),
        txCount: group.children.reduce((sum, child) => sum + (catCount[child.id] || 0), 0),
      }))
      .filter((group) => group.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    return {
      totalBudgeted,
      totalSpent,
      totalLeft,
      totalAssets,
      totalDebts,
      netWorth,
      netWorthChartData,
      topGroups,
      expectedIncome,
      actualIncome,
      remainingToAssignCents,
      isZeroBasedBalanced: remainingToAssignCents === 0 && expectedIncome > 0,
      overBudget: totalBudgeted > 0 && totalLeft < 0,
    };
  }, [categories, transactions, accounts, netWorthHistory, budgets, viewDate]);
}
