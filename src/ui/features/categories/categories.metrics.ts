import type { getCategories } from "../../../server/categories.fns";
import type { getMonthlyBudgets } from "../../../server/budget.fns";
import type { getTransactions } from "../../../server/transactions.fns";
import type { CategoryTableRow } from "./CategoryTable";
import { centsToDollars, getMonthKey } from "./categories.utils";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedMonthlyBudget = Awaited<ReturnType<typeof getMonthlyBudgets>>[number];

export type CategoryViewChild = LoadedGroup["children"][number] & {
  allocationAmount: number;
  spent: number;
  txCount: number;
  transactions: LoadedTransaction[];
};

export type CategoryViewGroup = Omit<LoadedGroup, "children"> & {
  children: CategoryViewChild[];
  spent: number;
  budget: number;
  txCount: number;
  activeChildren: number;
};

export type MonthlySpendingDatum = {
  budget: number;
  isSelectedMonth: boolean;
  label: string;
  month: string;
  shortLabel: string;
  spent: number;
  year: number;
};

export type CategoryYearMetric = {
  averageMonthly: number;
  monthCount: number;
  spent: number;
  year: number;
};

export function createCategoryTableRows({
  derivedGroups,
  expandedGroupIds,
}: {
  derivedGroups: CategoryViewGroup[];
  expandedGroupIds: Set<number>;
}) {
  const rows: CategoryTableRow[] = [];
  for (const group of derivedGroups) {
    rows.push({
      id: `group-${group.id}`,
      kind: "group",
      groupId: group.id,
      childId: null,
      name: group.name,
      icon: group.icon,
      spent: group.spent,
      budget: group.budget,
      txCount: group.txCount,
      childCount: group.children.length,
      activeChildren: group.activeChildren,
    });
    if (expandedGroupIds.has(group.id)) {
      for (const child of group.children) {
        rows.push({
          id: `child-${child.id}`,
          kind: "child",
          groupId: group.id,
          childId: child.id,
          name: child.name,
          icon: child.icon,
          spent: child.spent,
          budget: child.allocationAmount,
          txCount: child.txCount,
          childCount: 0,
          activeChildren: 0,
        });
      }
    }
  }
  return rows;
}

export function createSelectedGroupChartData({
  monthTransactions,
  selectedGroup,
  viewDate,
}: {
  monthTransactions: LoadedTransaction[];
  selectedGroup: CategoryViewGroup | null;
  viewDate: string;
}) {
  if (!selectedGroup) return [];
  const monthDate = new Date(viewDate);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const catIds = new Set(selectedGroup.children.map((child) => child.id));
  const dailySpent = new Map<number, number>();
  monthTransactions.forEach((tx) => {
    if (!tx.categoryId || !catIds.has(tx.categoryId)) return;
    const day = new Date(tx.date).getDate();
    dailySpent.set(day, (dailySpent.get(day) ?? 0) + tx.amount);
  });
  return Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    return {
      day,
      label: String(day),
      spent: Number((dailySpent.get(day) ?? 0).toFixed(2)),
    };
  });
}

export function createSelectedChildChartData({
  selectedChild,
  viewDate,
}: {
  selectedChild: CategoryViewChild | null;
  viewDate: string;
}) {
  if (!selectedChild) return [];
  const monthDate = new Date(viewDate);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const dailySpent = new Map<number, number>();
  selectedChild.transactions.forEach((tx) => {
    const day = new Date(tx.date).getDate();
    dailySpent.set(day, (dailySpent.get(day) ?? 0) + tx.amount);
  });
  const dailyBudget =
    selectedChild.allocationAmount > 0 ? selectedChild.allocationAmount / daysInMonth : 0;
  return Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    return {
      day,
      label: String(day),
      spent: Number((dailySpent.get(day) ?? 0).toFixed(2)),
      budget: Number(dailyBudget.toFixed(2)),
    };
  });
}

function monthStart(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function monthShortLabel(date: Date) {
  const month = date.getMonth();
  if (month === 0) return `Jan '${String(date.getFullYear()).slice(2)}`;
  if (month === 3) return "Apr";
  if (month === 6) return "Jul";
  if (month === 9) return "Oct";
  return "";
}

function allocationMapForMonth(budgets: LoadedMonthlyBudget[], month: string) {
  const budget = budgets.find((entry) => entry.month === month);
  return new Map(
    (budget?.allocations ?? []).map((allocation) => [
      allocation.categoryId,
      centsToDollars(allocation.amountCents),
    ]),
  );
}

function categoryBudgetForMonth({
  budgets,
  category,
  month,
}: {
  budgets: LoadedMonthlyBudget[];
  category: Pick<CategoryViewChild, "budgetAmount" | "id">;
  month: string;
}) {
  return allocationMapForMonth(budgets, month).get(category.id) ?? category.budgetAmount;
}

function groupBudgetForMonth({
  budgets,
  group,
  month,
}: {
  budgets: LoadedMonthlyBudget[];
  group: CategoryViewGroup;
  month: string;
}) {
  const allocationByCategoryId = allocationMapForMonth(budgets, month);
  return group.children.reduce(
    (sum, child) => sum + (allocationByCategoryId.get(child.id) ?? child.budgetAmount),
    0,
  );
}

export function createMonthlySpendingData({
  budgets,
  selectedChild,
  selectedGroup,
  transactions,
  viewDate,
}: {
  budgets: LoadedMonthlyBudget[];
  selectedChild: CategoryViewChild | null;
  selectedGroup: CategoryViewGroup | null;
  transactions: LoadedTransaction[];
  viewDate: string;
}) {
  if (!selectedGroup) return [];

  const selectedCategoryIds = new Set(
    selectedChild ? [selectedChild.id] : selectedGroup.children.map((child) => child.id),
  );
  const spentByMonth = new Map<string, number>();

  transactions.forEach((tx) => {
    if (
      tx.transactionType !== "regular" ||
      tx.amount <= 0 ||
      !tx.categoryId ||
      !selectedCategoryIds.has(tx.categoryId)
    ) {
      return;
    }

    const month = getMonthKey(tx.date);
    spentByMonth.set(month, (spentByMonth.get(month) ?? 0) + tx.amount);
  });

  const endMonth = monthStart(viewDate);
  const startMonth = shiftMonth(endMonth, -23);

  return Array.from({ length: 24 }, (_, index): MonthlySpendingDatum => {
    const date = shiftMonth(startMonth, index);
    const month = getMonthKey(date);
    const budget = selectedChild
      ? categoryBudgetForMonth({ budgets, category: selectedChild, month })
      : groupBudgetForMonth({ budgets, group: selectedGroup, month });

    return {
      budget: Number(budget.toFixed(2)),
      isSelectedMonth: month === getMonthKey(viewDate),
      label: monthLabel(date),
      month,
      shortLabel: monthShortLabel(date),
      spent: Number((spentByMonth.get(month) ?? 0).toFixed(2)),
      year: date.getFullYear(),
    };
  });
}

export function createCategoryYearMetrics(data: MonthlySpendingDatum[]): CategoryYearMetric[] {
  const byYear = data.reduce((map, datum) => {
    const current = map.get(datum.year) ?? {
      monthCount: 0,
      spent: 0,
      year: datum.year,
    };
    current.monthCount += 1;
    current.spent += datum.spent;
    map.set(datum.year, current);
    return map;
  }, new Map<number, { monthCount: number; spent: number; year: number }>());

  return Array.from(byYear.values())
    .map((metric) => ({
      ...metric,
      averageMonthly: metric.monthCount ? metric.spent / metric.monthCount : 0,
      spent: Number(metric.spent.toFixed(2)),
    }))
    .filter((metric) => metric.spent > 0)
    .sort((a, b) => b.year - a.year);
}
