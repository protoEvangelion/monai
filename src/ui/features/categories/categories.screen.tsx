import {
  Card,
  CardContent,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
} from "@heroui/react";
import { PlusIcon, PieChartIcon, CirclePlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { getCategories } from "../../../server/categories.fns";
import {
  getMonthlyBudgets,
  updateExpectedIncome,
} from "../../../server/budget.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { getTags } from "../../../server/transactions.fns";
import { useTimeTravel } from "../../hooks/useTimeTravel";
import { isSameMonth, getMonthKey, centsToDollars } from "./categories.utils";
import { useCategoryModal } from "./categories.hooks";
import { CategoryTopCard } from "./CategoryTopCard";
import { MonthControls } from "./MonthControls";
import { CategoryTable, type CategoryTableRow } from "./CategoryTable";
import { CategoryDetailPanel } from "./CategoryDetailPanel";
import { CategoryModal } from "./CategoryModal";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedMonthlyBudget = Awaited<
  ReturnType<typeof getMonthlyBudgets>
>[number];
type LoadedTag = Awaited<ReturnType<typeof getTags>>[number];

export function CategoriesScreen({
  groups,
  transactions,
  budgets,
  tags,
}: {
  groups: LoadedGroup[];
  transactions: LoadedTransaction[];
  budgets: LoadedMonthlyBudget[];
  tags: LoadedTag[];
}) {
  const router = useRouter();
  const { viewDate } = useTimeTravel();
  const refresh = useCallback(() => router.invalidate(), [router]);
  const {
    modal,
    setModal,
    deletingId,
    closeModal,
    handleModalSuccess,
    handleDelete,
  } = useCategoryModal(refresh);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    groups[0]?.id ?? null,
  );
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);

  const monthKey = useMemo(() => getMonthKey(viewDate), [viewDate]);
  const monthlyBudget = useMemo<LoadedMonthlyBudget | null>(
    () => budgets.find((b) => b.month === monthKey) ?? null,
    [budgets, monthKey],
  );
  const allocationByCategoryId = useMemo(
    () =>
      new Map(
        (monthlyBudget?.allocations ?? []).map((a) => [
          a.categoryId,
          centsToDollars(a.amountCents),
        ]),
      ),
    [monthlyBudget],
  );
  const expectedIncome = centsToDollars(
    monthlyBudget?.expectedIncomeCents ?? 0,
  );

  useEffect(() => {
    setIncomeInput(expectedIncome ? String(expectedIncome) : "");
  }, [expectedIncome, monthKey]);

  const saveExpectedIncome = useCallback(async () => {
    const amount = Math.max(0, Number(incomeInput) || 0);
    if (amount === expectedIncome) return;
    setSavingIncome(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateExpectedIncome as any)({
        data: { month: viewDate, expectedIncome: amount },
      });
      refresh();
    } finally {
      setSavingIncome(false);
    }
  }, [expectedIncome, incomeInput, refresh, viewDate]);

  const incomeCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    groups
      .filter((g) => g.name.toLowerCase() === "income")
      .forEach((g) => g.children.forEach((c) => ids.add(c.id)));
    return ids;
  }, [groups]);

  const monthAllTransactions = useMemo(
    () => transactions.filter((tx) => isSameMonth(tx.date, viewDate)),
    [transactions, viewDate],
  );
  const budgetedMonthTransactions = useMemo(
    () => monthAllTransactions.filter((tx) => !tx.isInternalTransfer),
    [monthAllTransactions],
  );
  const monthTransactions = useMemo(
    () =>
      budgetedMonthTransactions.filter(
        (tx) =>
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
            tx.amount < 0 ||
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

  const derivedGroups = useMemo(
    () =>
      groups.map((group) => {
        const children = group.children
          .map((child) => {
            const metrics = categoryMetrics.get(child.id);
            const allocationAmount =
              allocationByCategoryId.get(child.id) ?? child.budgetAmount;
            return {
              ...child,
              allocationAmount,
              spent: metrics?.spent ?? 0,
              txCount: metrics?.txCount ?? 0,
              transactions: metrics?.transactions ?? [],
            };
          })
          .sort((a, b) =>
            b.spent !== a.spent
              ? b.spent - a.spent
              : a.name.localeCompare(b.name),
          );
        const spent = children.reduce((s, c) => s + c.spent, 0);
        const budget = children.reduce((s, c) => s + c.allocationAmount, 0);
        return {
          ...group,
          children,
          spent,
          budget,
          txCount: children.reduce((s, c) => s + c.txCount, 0),
          activeChildren: children.filter((c) => c.spent > 0).length,
        };
      }),
    [allocationByCategoryId, categoryMetrics, groups],
  );

  const totals = useMemo(() => {
    const expenseGroups = derivedGroups.filter(
      (g) => g.name.toLowerCase() !== "income",
    );
    const totalSpent = expenseGroups.reduce((s, g) => s + g.spent, 0);
    const totalBudget = expenseGroups.reduce((s, g) => s + g.budget, 0);
    return {
      totalSpent,
      totalBudget,
      remainingToAssignCents:
        (monthlyBudget?.expectedIncomeCents ?? 0) -
        Math.round(totalBudget * 100),
    };
  }, [derivedGroups, monthlyBudget]);

  useEffect(() => {
    if (!derivedGroups.length) {
      setSelectedGroupId(null);
      setDetailOpen(false);
      return;
    }
    if (!derivedGroups.some((g) => g.id === selectedGroupId))
      setSelectedGroupId(derivedGroups[0].id);
  }, [derivedGroups, selectedGroupId]);

  useEffect(() => {
    setExpandedGroupIds((prev) => {
      const validIds = new Set(derivedGroups.map((g) => g.id));
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
    const selectedGroup = derivedGroups.find((g) => g.id === selectedGroupId);
    if (!selectedGroup?.children.some((c) => c.id === selectedChildId))
      setSelectedChildId(null);
  }, [derivedGroups, selectedChildId, selectedGroupId]);

  const selectedGroup =
    derivedGroups.find((g) => g.id === selectedGroupId) ??
    derivedGroups[0] ??
    null;
  const selectedChild =
    selectedGroup?.children.find((c) => c.id === selectedChildId) ?? null;
  const monthLabel = new Date(viewDate).toLocaleDateString("en-US", {
    month: "short",
  });

  const selectedGroupChartData = useMemo(() => {
    if (!selectedGroup) return [];
    const monthDate = new Date(viewDate);
    const daysInMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    ).getDate();
    const catIds = new Set(selectedGroup.children.map((c) => c.id));
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
  }, [monthTransactions, selectedGroup, viewDate]);

  const selectedChildChartData = useMemo(() => {
    if (!selectedChild) return [];
    const monthDate = new Date(viewDate);
    const daysInMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    ).getDate();
    const dailySpent = new Map<number, number>();
    selectedChild.transactions.forEach((tx) => {
      const day = new Date(tx.date).getDate();
      dailySpent.set(day, (dailySpent.get(day) ?? 0) + tx.amount);
    });
    const dailyBudget =
      selectedChild.allocationAmount > 0
        ? selectedChild.allocationAmount / daysInMonth
        : 0;
    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      return {
        day,
        label: String(day),
        spent: Number((dailySpent.get(day) ?? 0).toFixed(2)),
        budget: Number(dailyBudget.toFixed(2)),
      };
    });
  }, [selectedChild, viewDate]);

  const chartData = selectedChild
    ? selectedChildChartData
    : selectedGroupChartData;

  const selectedTransactions = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedChild) {
      return monthTransactions
        .filter((tx) => tx.categoryId === selectedChild.id)
        .slice()
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
    }
    const groupCatIds = new Set(selectedGroup.children.map((c) => c.id));
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

  const tableRows = useMemo<CategoryTableRow[]>(() => {
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
  }, [derivedGroups, expandedGroupIds]);

  const openDetailsForRow = useCallback((item: CategoryTableRow) => {
    if (item.kind === "group") {
      setSelectedGroupId(item.groupId);
      setSelectedChildId(null);
      setDetailOpen(true);
      return;
    }
    if (item.childId) {
      setSelectedGroupId(item.groupId);
      setSelectedChildId(item.childId);
      setDetailOpen(true);
    }
  }, []);

  const handleToggleExpand = useCallback((item: CategoryTableRow) => {
    setSelectedGroupId(item.groupId);
    setSelectedChildId(null);
    setDetailOpen(true);
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.groupId)) next.delete(item.groupId);
      else next.add(item.groupId);
      return next;
    });
  }, []);

  // Build selected context for DetailPanel
  const detailSelected = useMemo(() => {
    if (!selectedGroup) return null;
    if (selectedChild)
      return {
        kind: "child" as const,
        group: selectedGroup,
        child: { ...selectedChild, transactions: selectedTransactions },
      };
    return {
      kind: "group" as const,
      group: { ...selectedGroup, spent: selectedGroup.spent },
    };
  }, [selectedChild, selectedGroup, selectedTransactions]);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-5 pb-20">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 justify-self-start">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="mt-0.5 text-sm text-default-400">
            {groups.length} group{groups.length !== 1 ? "s" : ""} ·{" "}
            {groups.reduce((s, g) => s + g.children.length, 0)} categories
          </p>
        </div>
        <div className="justify-self-center">
          <MonthControls transactions={transactions} />
        </div>
        <div className="flex items-center gap-3 justify-self-end">
          <Dropdown>
            <DropdownTrigger className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_16px_color-mix(in_oklch,var(--color-accent)_45%,transparent)] transition-all hover:brightness-95 hover:shadow-[0_0_22px_color-mix(in_oklch,var(--color-accent)_60%,transparent)] active:scale-95">
              <CirclePlusIcon size={14} />
              New
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label="Create actions">
                <DropdownItem
                  key="new-group"
                  onAction={() => setModal({ mode: "create-group" })}
                >
                  <div className="flex items-center gap-2">
                    <PlusIcon size={13} />
                    <span>New Group</span>
                  </div>
                </DropdownItem>
                <DropdownItem
                  key="new-category"
                  isDisabled={!selectedGroup}
                  onAction={() => {
                    if (!selectedGroup) return;
                    setModal({
                      mode: "create-child",
                      parentId: selectedGroup.id,
                      parentName: selectedGroup.name,
                    });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <PlusIcon size={13} />
                    <span>New Category</span>
                  </div>
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </div>
      </div>

      <CategoryTopCard
        expectedIncome={expectedIncome}
        actualIncome={actualIncome}
        totalSpent={totals.totalSpent}
        totalBudget={totals.totalBudget}
        remainingToAssignCents={totals.remainingToAssignCents}
        incomeInput={incomeInput}
        savingIncome={savingIncome}
        onIncomeInputChange={setIncomeInput}
        onSaveIncome={saveExpectedIncome}
      />

      {groups.length === 0 ? (
        <Card className="w-full bg-background/60 backdrop-blur-md border-divider/50">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-default-100 flex items-center justify-center">
              <PieChartIcon size={28} className="text-default-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-semibold">No categories yet</p>
              <p className="text-sm text-default-400 max-w-xs">
                Create a group to start organizing your spending and setting
                budgets.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onPress={() => setModal({ mode: "create-group" })}
            >
              <PlusIcon size={15} /> New Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex min-h-[56vh] flex-col items-stretch gap-4 md:flex-row">
          <div className="min-w-0 md:basis-3/5">
            <CategoryTable
              rows={tableRows}
              selectedRowId={selectedRowId}
              expandedGroupIds={expandedGroupIds}
              onRowClick={openDetailsForRow}
              onToggleExpand={handleToggleExpand}
            />
          </div>
          <div
            className={[
              "min-w-0 md:flex md:basis-2/5",
              detailOpen ? "block" : "hidden md:block",
            ].join(" ")}
          >
            <CategoryDetailPanel
              selected={detailSelected}
              selectedGroups={groups}
              tags={tags}
              viewDate={viewDate}
              monthLabel={monthLabel}
              chartData={chartData}
              onRefresh={refresh}
              onClose={() => setDetailOpen(false)}
              onEditGroup={(group) =>
                setModal({
                  mode: "edit-group",
                  category: {
                    id: group.id,
                    name: group.name,
                    icon: group.icon,
                    budgetAmount: 0,
                  },
                })
              }
              onEditChild={(child) =>
                setModal({
                  mode: "edit-child",
                  category: {
                    id: child.id,
                    name: child.name,
                    icon: child.icon,
                    budgetAmount: child.budgetAmount,
                  },
                })
              }
              onDeleteGroup={(id) => handleDelete(id, true)}
              onDeleteChild={(id) => handleDelete(id, false)}
              deletingId={deletingId}
            />
          </div>
        </div>
      )}

      {modal ? (
        <CategoryModal
          modal={modal}
          onClose={closeModal}
          onSuccess={handleModalSuccess}
        />
      ) : null}
    </div>
  );
}
