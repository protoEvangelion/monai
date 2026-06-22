import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../../../lib/format";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import {
  setTransactionsInternalTransfer,
  setTransactionsType,
  updateTransactionsCategory,
} from "../../../server/transactions.fns";
import { StyledCheckbox } from "../../shared/StyledCheckbox";
import { CategoryTransactionsBulkBar } from "./CategoryTransactionsBulkBar";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];

type GroupedDay = {
  key: string;
  label: string;
  transactions: LoadedTransaction[];
};

export function CategoryTransactionsPanel({
  transactions,
  selectedGroups,
  onRefresh,
}: {
  transactions: LoadedTransaction[];
  selectedGroups: LoadedGroup[];
  onRefresh: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

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
  const allSelected = transactions.length > 0 && transactions.every((tx) => selectedIds.has(tx.id));
  const allSelectedAreInternal =
    selectedTransactions.length > 0 &&
    selectedTransactions.every((tx) => tx.transactionType === "transfer");

  const toggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setInternalTransfer = async (ids: number[], isInternalTransfer: boolean) => {
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

  const setTransactionType = async (ids: number[], transactionType: "income" | "transfer") => {
    if (!ids.length) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (setTransactionsType as any)({ data: { ids, transactionType } });
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
        const existing = acc.find((group: GroupedDay) => group.key === key);
        if (existing) existing.transactions.push(tx);
        else acc.push({ key, label, transactions: [tx] });
        return acc;
      }, []),
    [transactions],
  );

  return (
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
              setSelectedIds(allSelected ? new Set() : new Set(transactions.map((tx) => tx.id)));
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
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="bg-default-50/70 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-default-400">
                {group.label}
              </div>
              {group.transactions.map((tx) => {
                const checked = selectedIds.has(tx.id);
                return (
                  <div
                    key={tx.id}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors ${checked ? "bg-primary/10" : "hover:bg-default-50"}`}
                  >
                    <StyledCheckbox
                      checked={checked}
                      onChange={() => toggleOne(tx.id)}
                      aria-label={`Select transaction ${tx.merchantName}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {tx.merchantName}
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-default-400">
                        {tx.account?.name ? <span className="truncate">{tx.account.name}</span> : null}
                        {tx.transactionType === "transfer" ? (
                          <span className="rounded-full bg-warning-soft px-1.5 py-0.5 font-semibold text-warning">
                            Transfer
                          </span>
                        ) : null}
                        {tx.transactionType === "income" ? (
                          <span className="rounded-full bg-success-soft px-1.5 py-0.5 font-semibold text-success">
                            Income
                          </span>
                        ) : null}
                        {tx.note ? <span className="truncate text-default-400">{tx.note}</span> : null}
                      </div>
                    </div>
                    <span
                      className={`w-20 shrink-0 text-right text-sm font-bold tabular-nums ${tx.amount < 0 ? "text-danger" : "text-foreground"}`}
                    >
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <CategoryTransactionsBulkBar
        allSelectedAreInternal={allSelectedAreInternal}
        saving={saving}
        selectedGroups={selectedGroups}
        selectedTransactions={selectedTransactions}
        onClearSelection={() => setSelectedIds(new Set())}
        onSelectAll={() => setSelectedIds(new Set(transactions.map((tx) => tx.id)))}
        onSetCategory={setCategory}
        onSetInternalTransfer={setInternalTransfer}
        onSetTransactionType={setTransactionType}
      />
    </div>
  );
}
