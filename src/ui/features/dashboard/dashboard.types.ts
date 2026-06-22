import type { getAccounts, getNetWorthHistory } from "../../../server/accounts.fns";
import type { getMonthlyBudgets } from "../../../server/budget.fns";
import type { getCategoriesWithSpending } from "../../../server/categories.fns";
import type { getTransactions } from "../../../server/transactions.fns";

export type DashboardCategoriesData = Awaited<ReturnType<typeof getCategoriesWithSpending>>;
export type DashboardTransactionsData = Awaited<ReturnType<typeof getTransactions>>;
export type DashboardAccountsData = Awaited<ReturnType<typeof getAccounts>>;
export type DashboardNetWorthData = Awaited<ReturnType<typeof getNetWorthHistory>>;
export type DashboardBudgetsData = Awaited<ReturnType<typeof getMonthlyBudgets>>;

export type DashboardTopGroup = {
  id: number;
  name: string;
  icon: string | null;
  totalSpent: number;
  totalBudget: number;
  txCount: number;
};

export type DashboardNetWorthPoint = {
  day?: number;
  monthKey?: string;
  date?: Date | string;
  dateLabel?: string;
  assets: number;
  debts: number;
  netWorth: number;
};
