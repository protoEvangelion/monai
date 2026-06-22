import {
  ArrowDownCircleIcon,
  CheckIcon,
  CircleOffIcon,
  PlusIcon,
  RepeatIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CategoryGroup, Tx } from "./transactions.types";
import { transactionTypeBadgeClass, transactionTypeLabel } from "./transactions.utils";

export function TransactionCategoryCell({
  catSearch,
  color,
  filteredGroups,
  onCategoryChange,
  onCreateCategory,
  onPickerTxIdChange,
  onTransactionTypeChange,
  onCategorySearchChange,
  pickerTxId,
  tx,
}: {
  catSearch: string;
  color: string;
  filteredGroups: CategoryGroup[];
  onCategoryChange: (txId: number, categoryId: number | null) => void;
  onCreateCategory: (tx: Tx) => void;
  onPickerTxIdChange: (txId: number | null) => void;
  onTransactionTypeChange: (txId: number, transactionType: "income" | "transfer") => void;
  onCategorySearchChange: (value: string) => void;
  pickerTxId: number | null;
  tx: Tx;
}) {
  const isPickerOpen = pickerTxId === tx.id;
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPickerOpen) return;
    searchInputRef.current?.focus({ preventScroll: true });
  }, [isPickerOpen]);

  const picker = isPickerOpen ? (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/15 p-4"
      onClick={(event) => {
        event.stopPropagation();
        onPickerTxIdChange(null);
        onCategorySearchChange("");
      }}
    >
      <div
        style={{
          backgroundColor: "color-mix(in oklch, var(--background) 96%, white 4%)",
        }}
        className="w-full max-w-80 overflow-hidden rounded-2xl border border-divider p-0 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div role="dialog" className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col">
          <input
            ref={searchInputRef}
            value={catSearch}
            onChange={(event) => onCategorySearchChange(event.target.value)}
            placeholder="Search category"
            className="w-full shrink-0 border-b border-divider bg-content2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-default-400"
          />
          <div className="border-b border-divider px-1.5 py-1.5">
            <button
              type="button"
              onClick={() => onTransactionTypeChange(tx.id, "income")}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                tx.transactionType === "income"
                  ? "border-success/50 bg-success-soft text-success"
                  : "border-transparent text-default-700 hover:border-divider hover:bg-content2 hover:text-foreground"
              }`}
            >
              <ArrowDownCircleIcon size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Income</span>
              {tx.transactionType === "income" ? (
                <CheckIcon size={13} className="shrink-0" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onTransactionTypeChange(tx.id, "transfer")}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                tx.transactionType === "transfer"
                  ? "border-warning/50 bg-warning-soft text-warning"
                  : "border-transparent text-default-700 hover:border-divider hover:bg-content2 hover:text-foreground"
              }`}
            >
              <RepeatIcon size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Transfer</span>
              {tx.transactionType === "transfer" ? (
                <CheckIcon size={13} className="shrink-0" />
              ) : null}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {filteredGroups.map((group) => (
              <div key={group.id} className="px-1.5 pb-1.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
                  {group.icon} {group.name}
                </div>
                {group.children.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onCategoryChange(tx.id, category.id)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                      tx.category?.id === category.id
                        ? "border-success/50 bg-success-soft text-success"
                        : "border-transparent text-default-700 hover:border-divider hover:bg-content2 hover:text-foreground"
                    }`}
                  >
                    <span className="text-base leading-none">{category.icon}</span>
                    <span className="flex-1 truncate">{category.name}</span>
                    {tx.category?.id === category.id ? (
                      <CheckIcon size={13} className="shrink-0 text-success" />
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              backgroundColor: "color-mix(in oklch, var(--background) 96%, white 4%)",
            }}
            className="sticky bottom-0 border-t border-divider px-1.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => onCreateCategory(tx)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
            >
              <PlusIcon size={14} className="shrink-0" />
              <span>New category</span>
            </button>
            <button
              type="button"
              onClick={() => onCategoryChange(tx.id, null)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
            >
              <CircleOffIcon size={14} className="shrink-0" />
              <span>Exclude</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {tx.transactionType === "regular" ? (
        <button
          type="button"
          className="inline-flex max-w-36 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase transition-opacity hover:opacity-80"
          style={{ backgroundColor: `${color}22`, color }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onPickerTxIdChange(tx.id);
          }}
        >
          <span>{tx.category?.icon ?? "❓"}</span>
          <span className="truncate">{tx.category?.name ?? "Uncategorized"}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase transition-opacity hover:opacity-80 ${transactionTypeBadgeClass(tx.transactionType)}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onPickerTxIdChange(tx.id);
          }}
        >
          {transactionTypeLabel(tx.transactionType)}
        </button>
      )}

      {picker && typeof document !== "undefined" ? createPortal(picker, document.body) : picker}
    </>
  );
}
