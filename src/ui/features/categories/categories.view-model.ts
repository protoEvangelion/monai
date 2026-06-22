import { useCallback, useEffect, useMemo, useState } from "react";
import type { getMonthlyBudgets } from "../../../server/budget.fns";
import type { getCategories } from "../../../server/categories.fns";
import type { getTransactions } from "../../../server/transactions.fns";
import type { CategoryTableRow } from "./CategoryTable";
import {
  createCategoryYearMetrics,
  createCategoryTableRows,
  createMonthlySpendingData,
  type CategoryViewGroup,
} from "./categories.metrics";
import { centsToDollars, getMonthKey, isSameMonth } from "./categories.utils";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedMonthlyBudget = Awaited<ReturnType<typeof getMonthlyBudgets>>[number];

export function useCategoriesViewModel({
  groups,
  onSelectedCategoryKeyChange,
  selectedCategoryKey,
  transactions,
  budgets,
  viewDate,
}: {
  groups: LoadedGroup[];
  onSelectedCategoryKeyChange?: (categoryKey?: string) => void;
  selectedCategoryKey?: string;
  transactions: LoadedTransaction[];
  budgets: LoadedMonthlyBudget[];
  viewDate: string;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(groups[0]?.id ?? null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => new Set());
  const [detailOpen, setDetailOpen] = useState(false);

  const monthKey = useMemo(() => getMonthKey(viewDate), [viewDate]);
  const monthlyBudget = useMemo<LoadedMonthlyBudget | null>(
    () => budgets.find((budget) => budget.month === monthKey) ?? null,
    [budgets, monthKey],
  );
  const allocationByCategoryId = useMemo(
    () =>
      new Map(
        (monthlyBudget?.allocations ?? []).map((allocation) => [
          allocation.categoryId,
          centsToDollars(allocation.amountCents),
        ]),
      ),
    [monthlyBudget],
  );
  const expectedIncome = centsToDollars(monthlyBudget?.expectedIncomeCents ?? 0);

  const incomeCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    groups
      .filter((group) => group.name.toLowerCase() === "income")
      .forEach((group) => group.children.forEach((child) => ids.add(child.id)));
    return ids;
  }, [groups]);

  const monthAllTransactions = useMemo(
    () => transactions.filter((tx) => isSameMonth(tx.date, viewDate)),
    [transactions, viewDate],
  );
  const budgetedMonthTransactions = useMemo(
    () => monthAllTransactions.filter((tx) => tx.transactionType !== "transfer"),
    [monthAllTransactions],
  );
  const monthTransactions = useMemo(
    () =>
      budgetedMonthTransactions.filter(
        (tx) =>
          tx.transactionType === "regular" &&
          tx.amount > 0 &&
          (!tx.categoryId || !incomeCategoryIds.has(tx.categoryId)),
      ),
    [budgetedMonthTransactions, incomeCategoryIds],
  );
  const actualIncome = useMemo(
    () =>
      budgetedMonthTransactions
        .filter(
          (tx) =>
            tx.transactionType === "income" ||
            (tx.categoryId && incomeCategoryIds.has(tx.categoryId)),
        )
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    [budgetedMonthTransactions, incomeCategoryIds],
  );

  const categoryMetrics = useMemo(
    () =>
      monthTransactions.reduce((map, tx) => {
        if (!tx.categoryId) return map;
        const curr = map.get(tx.categoryId) ?? {
          spent: 0,
          txCount: 0,
          transactions: [] as LoadedTransaction[],
        };
        curr.spent += tx.amount;
        curr.txCount += 1;
        curr.transactions.push(tx);
        map.set(tx.categoryId, curr);
        return map;
      }, new Map<number, { spent: number; txCount: number; transactions: LoadedTransaction[] }>()),
    [monthTransactions],
  );

  const derivedGroups = useMemo<CategoryViewGroup[]>(
    () =>
      groups.map((group) => {
        const children = group.children
          .map((child) => {
            const metrics = categoryMetrics.get(child.id);
            const allocationAmount = allocationByCategoryId.get(child.id) ?? child.budgetAmount;
            return {
              ...child,
              allocationAmount,
              spent: metrics?.spent ?? 0,
              txCount: metrics?.txCount ?? 0,
              transactions: metrics?.transactions ?? [],
            };
          })
          .sort((a, b) => (b.spent !== a.spent ? b.spent - a.spent : a.name.localeCompare(b.name)));
        const spent = children.reduce((sum, child) => sum + child.spent, 0);
        const budget = children.reduce((sum, child) => sum + child.allocationAmount, 0);
        return {
          ...group,
          children,
          spent,
          budget,
          txCount: children.reduce((sum, child) => sum + child.txCount, 0),
          activeChildren: children.filter((child) => child.spent > 0).length,
        };
      }),
    [allocationByCategoryId, categoryMetrics, groups],
  );

  const totals = useMemo(() => {
    const expenseGroups = derivedGroups.filter((group) => group.name.toLowerCase() !== "income");
    const totalSpent = expenseGroups.reduce((sum, group) => sum + group.spent, 0);
    const totalBudget = expenseGroups.reduce((sum, group) => sum + group.budget, 0);
    return {
      totalSpent,
      totalBudget,
      remainingToAssignCents:
        (monthlyBudget?.expectedIncomeCents ?? 0) - Math.round(totalBudget * 100),
    };
  }, [derivedGroups, monthlyBudget]);

  useEffect(() => {
    if (!derivedGroups.length) {
      setSelectedGroupId(null);
      setSelectedChildId(null);
      setDetailOpen(false);
      return;
    }
    if (!derivedGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(derivedGroups[0].id);
    }
  }, [derivedGroups, selectedGroupId]);

  useEffect(() => {
    setExpandedGroupIds((prev) => {
      const validIds = new Set(derivedGroups.map((group) => group.id));
      const next = new Set<number>();
      if (prev.size === 0) {
        validIds.forEach((id) => next.add(id));
        return next;
      }
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      validIds.forEach((id) => {
        if (!prev.has(id)) next.add(id);
      });
      return next;
    });
  }, [derivedGroups]);

  useEffect(() => {
    if (!selectedChildId) return;
    const selectedGroup = derivedGroups.find((group) => group.id === selectedGroupId);
    if (!selectedGroup?.children.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(null);
    }
  }, [derivedGroups, selectedChildId, selectedGroupId]);

  useEffect(() => {
    if (!selectedCategoryKey) return;
    const [kind, rawId] = selectedCategoryKey.split("-");
    const id = Number(rawId);
    if (!Number.isFinite(id)) return;

    if (kind === "group") {
      const group = derivedGroups.find((item) => item.id === id);
      if (!group) return;
      setSelectedGroupId(group.id);
      setSelectedChildId(null);
      setDetailOpen(true);
      return;
    }

    if (kind === "child") {
      const group = derivedGroups.find((item) => item.children.some((child) => child.id === id));
      if (!group) return;
      setSelectedGroupId(group.id);
      setSelectedChildId(id);
      setDetailOpen(true);
    }
  }, [derivedGroups, selectedCategoryKey]);

  const selectedGroup =
    derivedGroups.find((group) => group.id === selectedGroupId) ?? derivedGroups[0] ?? null;
  const selectedChild = selectedGroup?.children.find((child) => child.id === selectedChildId) ?? null;
  const monthLabel = new Date(viewDate).toLocaleDateString("en-US", {
    month: "short",
  });

  const chartData = useMemo(
    () =>
      createMonthlySpendingData({
        budgets,
        selectedChild,
        selectedGroup,
        transactions,
        viewDate,
      }),
    [budgets, selectedChild, selectedGroup, transactions, viewDate],
  );
  const yearMetrics = useMemo(() => createCategoryYearMetrics(chartData), [chartData]);

  const selectedTransactions = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedChild) {
      return monthTransactions
        .filter((tx) => tx.categoryId === selectedChild.id)
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    const groupCatIds = new Set(selectedGroup.children.map((child) => child.id));
    return monthTransactions
      .filter((tx) => tx.categoryId && groupCatIds.has(tx.categoryId))
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [monthTransactions, selectedChild, selectedGroup]);

  const selectedRowId =
    selectedChildId !== null
      ? `child-${selectedChildId}`
      : selectedGroupId !== null
        ? `group-${selectedGroupId}`
        : null;

  const tableRows = useMemo(
    () => createCategoryTableRows({ derivedGroups, expandedGroupIds }),
    [derivedGroups, expandedGroupIds],
  );

  const openDetailsForRow = useCallback((item: CategoryTableRow) => {
    if (item.kind === "group") {
      setSelectedGroupId(item.groupId);
      setSelectedChildId(null);
      setDetailOpen(true);
      onSelectedCategoryKeyChange?.(`group-${item.groupId}`);
      return;
    }
    if (item.childId) {
      setSelectedGroupId(item.groupId);
      setSelectedChildId(item.childId);
      setDetailOpen(true);
      onSelectedCategoryKeyChange?.(`child-${item.childId}`);
    }
  }, [onSelectedCategoryKeyChange]);

  const handleToggleExpand = useCallback((item: CategoryTableRow) => {
    setSelectedGroupId(item.groupId);
    setSelectedChildId(null);
    setDetailOpen(true);
    onSelectedCategoryKeyChange?.(`group-${item.groupId}`);
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.groupId)) next.delete(item.groupId);
      else next.add(item.groupId);
      return next;
    });
  }, [onSelectedCategoryKeyChange]);

  const closeDetails = useCallback(() => {
    setDetailOpen(false);
    onSelectedCategoryKeyChange?.(undefined);
  }, [onSelectedCategoryKeyChange]);

  const detailSelected = useMemo(() => {
    if (!selectedGroup) return null;
    if (selectedChild) {
      return {
        kind: "child" as const,
        group: selectedGroup,
        child: { ...selectedChild, transactions: selectedTransactions },
      };
    }
    return {
      kind: "group" as const,
      group: { ...selectedGroup, spent: selectedGroup.spent },
    };
  }, [selectedChild, selectedGroup, selectedTransactions]);

  return {
    actualIncome,
    chartData,
    closeDetails,
    detailOpen,
    detailSelected,
    expandedGroupIds,
    expectedIncome,
    handleToggleExpand,
    monthKey,
    monthLabel,
    openDetailsForRow,
    selectedGroup,
    selectedRowId,
    setDetailOpen,
    tableRows,
    totals,
    yearMetrics,
  };
}
