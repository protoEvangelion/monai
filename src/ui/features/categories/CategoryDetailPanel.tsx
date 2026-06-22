import {
  Card,
  CardContent,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
  Button,
} from "@heroui/react";
import {
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { formatCurrency } from "../../../lib/format";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { SpendingChart } from "./SpendingChart";
import { MonthlyBudgetInput } from "./MonthlyBudgetInput";
import { CategoryTransactionsPanel } from "./CategoryTransactionsPanel";
import { CategoryKeyMetrics } from "./CategoryKeyMetrics";
import type { CategoryYearMetric, MonthlySpendingDatum } from "./categories.metrics";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];

type SelectedItem =
  | {
      kind: "group";
      group: LoadedGroup & {
        spent: number;
        budget: number;
        children: Array<
          LoadedGroup["children"][number] & {
            allocationAmount: number;
            spent: number;
            txCount: number;
            transactions: LoadedTransaction[];
          }
        >;
      };
    }
  | {
      kind: "child";
      group: LoadedGroup;
      child: LoadedGroup["children"][number] & {
        allocationAmount: number;
        spent: number;
        txCount: number;
        transactions: LoadedTransaction[];
      };
};

export function CategoryDetailPanel({
  selected,
  selectedGroups,
  viewDate,
  monthLabel,
  chartData,
  yearMetrics,
  onRefresh,
  onClose,
  onEditGroup,
  onEditChild,
  onDeleteGroup,
  onDeleteChild,
  deletingId,
}: {
  selected: SelectedItem | null;
  selectedGroups: LoadedGroup[];
  viewDate: string;
  monthLabel: string;
  chartData: MonthlySpendingDatum[];
  yearMetrics: CategoryYearMetric[];
  onRefresh: () => void;
  onClose: () => void;
  onEditGroup: (group: SelectedItem["group"]) => void;
  onEditChild: (child: LoadedGroup["children"][number]) => void;
  onDeleteGroup: (id: number) => void;
  onDeleteChild: (id: number) => void;
  deletingId: number | null;
}) {
  const transactions = useMemo(() => {
    if (!selected) return [];
    if (selected.kind === "child") return selected.child.transactions;
    return selected.group.children
      .flatMap((c) => (c as (typeof selected.group.children)[number]).transactions)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selected]);

  if (!selected) return null;

  const group = selected.group;
  const child = selected.kind === "child" ? selected.child : null;
  const selectedSpent = selected.kind === "child" ? selected.child.spent : selected.group.spent;
  const selectedBudget =
    selected.kind === "child" ? selected.child.allocationAmount : selected.group.budget;
  const selectedAvailableRaw = selectedBudget - selectedSpent;
  const selectedAvailable = Math.abs(selectedAvailableRaw) < 0.005 ? 0 : selectedAvailableRaw;

  return (
    <Card className="h-full overflow-hidden border border-divider/60 bg-content1 shadow-none flex-1">
      <CardContent className="flex h-full min-h-0 flex-col p-0">
        <div className="border-b border-divider/40 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <button
                type="button"
                onClick={() => (child ? onEditChild(child) : onEditGroup(group))}
                className="group relative flex aspect-square h-12 w-12 min-w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-divider/40 bg-default-50 text-2xl transition-colors hover:bg-default-100"
                aria-label={child ? "Edit category icon" : "Edit group icon"}
              >
                <span>{child?.icon ?? group.icon}</span>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <PencilIcon size={14} className="text-white" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {child ? child.name : group.name}
                </h2>
                <p className="mt-1 text-sm text-default-400">
                  {child ? group.name : "Spending this month"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!child ? (
                <Dropdown>
                  <DropdownTrigger
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100"
                    aria-label="Group actions"
                  >
                    {deletingId === group.id ? (
                      <Loader2Icon size={14} className="animate-spin" />
                    ) : (
                      <MoreVerticalIcon size={14} />
                    )}
                  </DropdownTrigger>
                  <DropdownPopover>
                    <DropdownMenu aria-label="Group actions">
                      <DropdownItem key="edit" onAction={() => onEditGroup(group)}>
                        <div className="flex items-center gap-2">
                          <PencilIcon size={13} />
                          <span>Edit Group</span>
                        </div>
                      </DropdownItem>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        onAction={() => onDeleteGroup(group.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Trash2Icon size={13} />
                          <span>Delete Group</span>
                        </div>
                      </DropdownItem>
                    </DropdownMenu>
                  </DropdownPopover>
                </Dropdown>
              ) : (
                <Dropdown>
                  <DropdownTrigger
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100"
                    aria-label="Category actions"
                  >
                    {deletingId === child.id ? (
                      <Loader2Icon size={14} className="animate-spin" />
                    ) : (
                      <MoreVerticalIcon size={14} />
                    )}
                  </DropdownTrigger>
                  <DropdownPopover>
                    <DropdownMenu aria-label="Category actions">
                      <DropdownItem key="edit" onAction={() => onEditChild(child)}>
                        <div className="flex items-center gap-2">
                          <PencilIcon size={13} />
                          <span>Edit Category</span>
                        </div>
                      </DropdownItem>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        onAction={() => onDeleteChild(child.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Trash2Icon size={13} />
                          <span>Delete Category</span>
                        </div>
                      </DropdownItem>
                    </DropdownMenu>
                  </DropdownPopover>
                </Dropdown>
              )}
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                className="rounded-lg md:hidden"
                aria-label="Close category details"
                onPress={onClose}
              >
                <XIcon size={15} />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Spent</p>
              <p className="truncate text-sm font-bold text-foreground">
                {formatCurrency(selectedSpent)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Left</p>
              <p
                className={`truncate text-sm font-bold ${selectedAvailable < 0 ? "text-danger" : "text-success"}`}
              >
                {selectedAvailable < 0 ? "-" : ""}
                {formatCurrency(Math.abs(selectedAvailable))}
              </p>
            </div>
            {child ? (
              <MonthlyBudgetInput
                categoryId={child.id}
                month={viewDate}
                value={child.allocationAmount}
                onSaved={onRefresh}
              />
            ) : (
              <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
                <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">
                  Categories
                </p>
                <p className="truncate text-sm font-bold text-foreground">
                  {group.children.length}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-b border-divider/30 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
              {child ? `${child.name} in ${monthLabel}` : `Spent in ${monthLabel}`}
            </p>
            <p className="text-sm font-semibold text-default-600">
              {child
                ? `${formatCurrency(child.spent)} / ${formatCurrency(child.allocationAmount)}`
                : formatCurrency(selected.kind === "group" ? selected.group.spent : 0)}
            </p>
          </div>
          <SpendingChart data={chartData} showBudgetLine />
        </div>

        <CategoryKeyMetrics metrics={yearMetrics} />

        <CategoryTransactionsPanel
          transactions={transactions}
          selectedGroups={selectedGroups}
          onRefresh={onRefresh}
        />
      </CardContent>
    </Card>
  );
}
