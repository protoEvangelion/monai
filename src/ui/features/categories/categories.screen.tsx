import {
  Button,
  Card,
  CardContent,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { CirclePlusIcon, PieChartIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getMonthlyBudgets, updateExpectedIncome } from "../../../server/budget.fns";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { useTimeTravel } from "../../hooks/useTimeTravel";
import { CategoryDetailPanel } from "./CategoryDetailPanel";
import { CategoryModal } from "./CategoryModal";
import { CategoryTable } from "./CategoryTable";
import { CategoryTopCard } from "./CategoryTopCard";
import { useCategoryModal } from "./categories.hooks";
import { useCategoriesViewModel } from "./categories.view-model";
import { MonthControls } from "./MonthControls";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedMonthlyBudget = Awaited<ReturnType<typeof getMonthlyBudgets>>[number];

export function CategoriesScreen({
  groups,
  onSelectedCategoryKeyChange,
  selectedCategoryKey,
  transactions,
  budgets,
}: {
  groups: LoadedGroup[];
  onSelectedCategoryKeyChange?: (categoryKey?: string) => void;
  selectedCategoryKey?: string;
  transactions: LoadedTransaction[];
  budgets: LoadedMonthlyBudget[];
}) {
  const router = useRouter();
  const { viewDate } = useTimeTravel();
  const refresh = useCallback(() => router.invalidate(), [router]);
  const { modal, setModal, deletingId, closeModal, handleModalSuccess, handleDelete } =
    useCategoryModal(refresh);
  const vm = useCategoriesViewModel({
    groups,
    onSelectedCategoryKeyChange,
    selectedCategoryKey,
    transactions,
    budgets,
    viewDate,
  });
  const [incomeInput, setIncomeInput] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);

  useEffect(() => {
    setIncomeInput(vm.expectedIncome ? String(vm.expectedIncome) : "");
  }, [vm.expectedIncome, vm.monthKey]);

  const saveExpectedIncome = useCallback(async () => {
    const amount = Math.max(0, Number(incomeInput) || 0);
    if (amount === vm.expectedIncome) return;
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
  }, [incomeInput, refresh, viewDate, vm.expectedIncome]);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-5 pb-20">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0 justify-self-start">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="mt-0.5 text-sm text-default-400">
            {groups.length} group{groups.length !== 1 ? "s" : ""} ·{" "}
            {groups.reduce((sum, group) => sum + group.children.length, 0)} categories
          </p>
        </div>
        <div className="min-w-0 justify-self-stretch sm:justify-self-center">
          <MonthControls transactions={transactions} />
        </div>
        <div className="flex items-center gap-3 justify-self-start sm:justify-self-end">
          <Dropdown>
            <DropdownTrigger className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_16px_color-mix(in_oklch,var(--color-accent)_45%,transparent)] transition-all hover:brightness-95 hover:shadow-[0_0_22px_color-mix(in_oklch,var(--color-accent)_60%,transparent)] active:scale-95">
              <CirclePlusIcon size={14} />
              New
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label="Create actions">
                <DropdownItem key="new-group" onAction={() => setModal({ mode: "create-group" })}>
                  <div className="flex items-center gap-2">
                    <PlusIcon size={13} />
                    <span>New Group</span>
                  </div>
                </DropdownItem>
                <DropdownItem
                  key="new-category"
                  isDisabled={!vm.selectedGroup}
                  onAction={() => {
                    if (!vm.selectedGroup) return;
                    setModal({
                      mode: "create-child",
                      parentId: vm.selectedGroup.id,
                      parentName: vm.selectedGroup.name,
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
        expectedIncome={vm.expectedIncome}
        actualIncome={vm.actualIncome}
        totalSpent={vm.totals.totalSpent}
        totalBudget={vm.totals.totalBudget}
        remainingToAssignCents={vm.totals.remainingToAssignCents}
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
                Create a group to start organizing your spending and setting budgets.
              </p>
            </div>
            <Button variant="primary" size="sm" onPress={() => setModal({ mode: "create-group" })}>
              <PlusIcon size={15} /> New Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex min-h-[56vh] flex-col items-stretch gap-4 md:flex-row">
          <div className="min-w-0 md:basis-3/5">
            <CategoryTable
              rows={vm.tableRows}
              selectedRowId={vm.selectedRowId}
              expandedGroupIds={vm.expandedGroupIds}
              onRowClick={vm.openDetailsForRow}
              onToggleExpand={vm.handleToggleExpand}
            />
          </div>
          <div
            className={[
              "min-w-0 md:flex md:basis-2/5",
              vm.detailOpen ? "block" : "hidden md:block",
            ].join(" ")}
          >
            <CategoryDetailPanel
              selected={vm.detailSelected}
              selectedGroups={groups}
              viewDate={viewDate}
              monthLabel={vm.monthLabel}
              chartData={vm.chartData}
              yearMetrics={vm.yearMetrics}
              onRefresh={refresh}
              onClose={vm.closeDetails}
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
                    parentId: child.parentId,
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
          groups={groups.map((group) => ({
            id: group.id,
            name: group.name,
            icon: group.icon,
          }))}
          modal={modal}
          onClose={() => {
            closeModal();
            if (
              ["/categories/new-group", "/categories/new-category"].includes(
                router.state.location.pathname,
              )
            ) {
              router.navigate({ to: "/categories" });
            }
          }}
          onSuccess={handleModalSuccess}
        />
      ) : null}
    </div>
  );
}
