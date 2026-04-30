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
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../../../lib/format";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { getTags } from "../../../server/transactions.fns";
import { SpendingChart } from "./SpendingChart";
import { MonthlyBudgetInput } from "./MonthlyBudgetInput";
import { CategoryActionPicker } from "./CategoryActionPicker";
import { TagActionPicker } from "./TagActionPicker";
import {
  setTransactionsInternalTransfer,
  updateTransactionsCategory,
} from "../../../server/transactions.fns";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedTag = Awaited<ReturnType<typeof getTags>>[number];

type GroupedDay = {
  key: string;
  label: string;
  transactions: LoadedTransaction[];
};

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

function StyledCheckbox({
  checked,
  onChange,
  onClick,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-300 bg-content2 accent-primary"
    />
  );
}

function getTransactionTags(tx: LoadedTransaction): LoadedTag[] {
  return (tx.tags ?? [])
    .map((entry) => entry.tag)
    .filter((tag): tag is LoadedTag => Boolean(tag));
}

export function CategoryDetailPanel({
  selected,
  selectedGroups,
  tags,
  viewDate,
  monthLabel,
  chartData,
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
  tags: LoadedTag[];
  viewDate: string;
  monthLabel: string;
  chartData: Array<{
    day: number;
    label: string;
    spent: number;
    budget?: number;
  }>;
  onRefresh: () => void;
  onClose: () => void;
  onEditGroup: (group: SelectedItem["group"]) => void;
  onEditChild: (child: LoadedGroup["children"][number]) => void;
  onDeleteGroup: (id: number) => void;
  onDeleteChild: (id: number) => void;
  deletingId: number | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const transactions = useMemo(() => {
    if (!selected) return [];
    if (selected.kind === "child") return selected.child.transactions;
    return selected.group.children
      .flatMap(
        (c) => (c as (typeof selected.group.children)[number]).transactions,
      )
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selected]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(transactions.map((tx) => tx.id));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [transactions]);

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.has(tx.id)),
    [selectedIds, transactions],
  );
  const allSelected =
    transactions.length > 0 &&
    transactions.every((tx) => selectedIds.has(tx.id));
  const allSelectedAreInternal =
    selectedTransactions.length > 0 &&
    selectedTransactions.every((tx) => tx.isInternalTransfer);

  const toggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setInternalTransfer = async (
    ids: number[],
    isInternalTransfer: boolean,
  ) => {
    if (!ids.length) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (setTransactionsInternalTransfer as any)({
        data: { ids, isInternalTransfer },
      });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const setCategory = async (ids: number[], categoryId: number | null) => {
    if (!ids.length) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateTransactionsCategory as any)({ data: { ids, categoryId } });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(
    () =>
      transactions.reduce<GroupedDay[]>((acc, tx) => {
        const date = new Date(tx.date);
        const key = date.toISOString().slice(0, 10);
        const label = date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const existing = acc.find((g: GroupedDay) => g.key === key);
        if (existing) existing.transactions.push(tx);
        else acc.push({ key, label, transactions: [tx] });
        return acc;
      }, []),
    [transactions],
  );

  if (!selected) return null;

  const isChild = selected.kind === "child";
  const group = selected.kind === "child" ? selected.group : selected.group;
  const child = selected.kind === "child" ? selected.child : null;
  const selectedSpent =
    selected.kind === "child" ? selected.child.spent : selected.group.spent;
  const selectedBudget =
    selected.kind === "child"
      ? selected.child.allocationAmount
      : selected.group.budget;
  const selectedAvailableRaw = selectedBudget - selectedSpent;
  const selectedAvailable =
    Math.abs(selectedAvailableRaw) < 0.005 ? 0 : selectedAvailableRaw;

  return (
    <Card className="h-full overflow-hidden border border-divider/60 bg-content1 shadow-none flex-1">
      <CardContent className="flex h-full min-h-0 flex-col p-0">
        <div className="border-b border-divider/40 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <button
                type="button"
                onClick={() =>
                  child ? onEditChild(child) : onEditGroup(group)
                }
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
                      <DropdownItem
                        key="edit"
                        onAction={() => onEditGroup(group)}
                      >
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
                      <DropdownItem
                        key="edit"
                        onAction={() => onEditChild(child)}
                      >
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
              <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">
                Spent
              </p>
              <p className="truncate text-sm font-bold text-foreground">
                {formatCurrency(selectedSpent, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">
                Left
              </p>
              <p
                className={`truncate text-sm font-bold ${selectedAvailable < 0 ? "text-danger" : "text-success"}`}
              >
                {selectedAvailable < 0 ? "-" : ""}
                {formatCurrency(Math.abs(selectedAvailable), {
                  maximumFractionDigits: 0,
                })}
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
              {child
                ? `${child.name} in ${monthLabel}`
                : `Spent in ${monthLabel}`}
            </p>
            <p className="text-sm font-semibold text-default-600">
              {child
                ? `${formatCurrency(child.spent, { maximumFractionDigits: 0 })} / ${formatCurrency(child.allocationAmount, { maximumFractionDigits: 0 })}`
                : formatCurrency(
                    selected.kind === "group" ? selected.group.spent : 0,
                    { maximumFractionDigits: 0 },
                  )}
            </p>
          </div>
          <SpendingChart data={chartData} showBudgetLine={Boolean(child)} />
        </div>

        {/* Transaction list */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="border-b border-divider/30 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
                Transactions
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-default-500 transition-colors hover:text-primary"
                onClick={() => {
                  setSelectedIds(
                    allSelected
                      ? new Set()
                      : new Set(transactions.map((tx) => tx.id)),
                  );
                }}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm italic text-default-400">
              No transactions for this view
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-divider/20">
              {grouped.map((g) => (
                <div key={g.key}>
                  <div className="bg-default-50/70 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-default-400">
                    {g.label}
                  </div>
                  {g.transactions.map((tx) => {
                    const checked = selectedIds.has(tx.id);
                    const txTags = getTransactionTags(tx);
                    return (
                      <div
                        key={tx.id}
                        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors ${checked ? "bg-primary/10" : "hover:bg-default-50"}`}
                      >
                        <StyledCheckbox
                          checked={checked}
                          onChange={() => toggleOne(tx.id)}
                          ariaLabel={`Select transaction ${tx.merchantName}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {tx.merchantName}
                          </p>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-default-400">
                            {tx.account?.name ? (
                              <span className="truncate">
                                {tx.account.name}
                              </span>
                            ) : null}
                            {tx.isInternalTransfer ? (
                              <span className="rounded-full bg-warning-soft px-1.5 py-0.5 font-semibold text-warning">
                                Transfer
                              </span>
                            ) : null}
                            {txTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center gap-1 rounded-full bg-default-100 px-1.5 py-0.5 text-[11px] font-medium text-default-600"
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span
                          className={`w-20 shrink-0 text-right text-sm font-bold tabular-nums ${tx.amount < 0 ? "text-danger" : "text-foreground"}`}
                        >
                          {formatCurrency(tx.amount, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {selectedTransactions.length > 0 ? (
            <div className="fixed bottom-4 right-4 z-90 flex w-[calc(40%-2rem)] min-w-64 max-w-104 items-center gap-2 rounded-2xl border border-divider bg-content1/95 p-2 shadow-xl backdrop-blur">
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => setSelectedIds(new Set())}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-divider/50 bg-background text-foreground transition-colors hover:text-danger"
              >
                <XIcon size={16} />
              </button>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-bold text-foreground">
                {selectedTransactions.length} selected
              </span>
              {saving ? (
                <Loader2Icon
                  size={16}
                  className="animate-spin text-default-400"
                />
              ) : null}
              <CategoryActionPicker
                categories={selectedGroups}
                selectedCategoryId={selectedTransactions[0]?.categoryId ?? null}
                ariaLabel="Change selected categories"
                onChange={(categoryId) =>
                  setCategory(
                    selectedTransactions.map((tx) => tx.id),
                    categoryId,
                  )
                }
              />
              <button
                type="button"
                aria-label={
                  allSelectedAreInternal
                    ? "Unmark selected internal transfers"
                    : "Mark selected internal transfers"
                }
                onClick={() =>
                  setInternalTransfer(
                    selectedTransactions.map((tx) => tx.id),
                    !allSelectedAreInternal,
                  )
                }
                className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-sm font-black transition-colors ${
                  allSelectedAreInternal
                    ? "border-warning/50 bg-warning-soft text-warning"
                    : "border-divider/50 bg-background text-default-600 hover:border-primary/40 hover:text-primary"
                }`}
              >
                T
              </button>
              <TagActionPicker
                tags={tags}
                targetTransactions={selectedTransactions}
                onRefresh={onRefresh}
              />
              <Dropdown>
                <DropdownTrigger
                  aria-label="Bulk transaction actions"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <MoreVerticalIcon size={16} />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label="Bulk transaction actions">
                    <DropdownItem
                      key="select-all"
                      onAction={() =>
                        setSelectedIds(new Set(transactions.map((tx) => tx.id)))
                      }
                    >
                      Select all
                    </DropdownItem>
                    <DropdownItem
                      key="clear"
                      onAction={() => setSelectedIds(new Set())}
                    >
                      Unselect all
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
