import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import {
  CalendarDaysIcon,
  CheckIcon,
  Loader2Icon,
  MoreVerticalIcon,
  RepeatIcon,
  SparklesIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { CategoryActionPicker } from "../categories/CategoryActionPicker";
import {
  FloatingSelectionToolbar,
  FloatingSelectionToolbarButton,
  floatingSelectionButtonClass,
} from "../../shared/FloatingSelectionToolbar";
import type { CategoryGroup, Tx } from "./transactions.types";
import { dateInputValue } from "./transactions.utils";

export function TransactionSelectionToolbar({
  categories,
  isAICategorizing,
  onAICategorize,
  onClearSelection,
  onSelectAll,
  onSetCategory,
  onSetDate,
  onSetReviewed,
  onSetTransactionType,
  selectedTransactions,
}: {
  categories: CategoryGroup[];
  isAICategorizing: boolean;
  onAICategorize: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onSetCategory: (ids: number[], categoryId: number | null) => void;
  onSetDate: (ids: number[], date: string) => void;
  onSetReviewed: (ids: number[], isReviewed: boolean) => void;
  onSetTransactionType: (
    ids: number[],
    transactionType: "regular" | "income" | "transfer",
  ) => void;
  selectedTransactions: Tx[];
}) {
  if (selectedTransactions.length === 0) return null;

  const selectedIds = selectedTransactions.map((tx) => tx.id);
  const firstSelectedDate = selectedTransactions[0]?.date
    ? dateInputValue(selectedTransactions[0].date)
    : "";
  const allSelectedAreTransfer = selectedTransactions.every(
    (tx) => tx.transactionType === "transfer",
  );
  const allSelectedAreReviewed = selectedTransactions.every((tx) => tx.isReviewed);
  const reviewLabel = allSelectedAreReviewed ? "Mark unreviewed" : "Mark reviewed";

  const toolbar = (
    <FloatingSelectionToolbar
      count={selectedTransactions.length}
      onClearSelection={onClearSelection}
    >
      <FloatingSelectionToolbarButton
        label={`AI Categorize ${selectedTransactions.length} selected`}
        onClick={onAICategorize}
        disabled={isAICategorizing}
        variant="ai"
      >
        {isAICategorizing ? (
          <Loader2Icon size={20} className="animate-spin" />
        ) : (
          <SparklesIcon size={20} />
        )}
      </FloatingSelectionToolbarButton>
      <CategoryActionPicker
        categories={categories}
        selectedCategoryId={selectedTransactions[0]?.categoryId ?? null}
        selectedTransactionType={selectedTransactions[0]?.transactionType ?? "regular"}
        ariaLabel="Change selected transaction categories"
        triggerClassName={floatingSelectionButtonClass()}
        onChange={(categoryId) => onSetCategory(selectedIds, categoryId)}
        onTypeChange={(transactionType) => onSetTransactionType(selectedIds, transactionType)}
      />
      <Popover>
        <PopoverTrigger>
          <button
            type="button"
            aria-label="Change selected transaction date"
            className={floatingSelectionButtonClass()}
          >
            <CalendarDaysIcon size={20} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl border border-divider p-3 shadow-xl">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
            Transaction date
          </label>
          <input
            type="date"
            defaultValue={firstSelectedDate}
            aria-label="Selected transaction date"
            onChange={(event) => {
              if (event.target.value) onSetDate(selectedIds, event.target.value);
            }}
            className="h-11 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary"
          />
        </PopoverContent>
      </Popover>
      <FloatingSelectionToolbarButton
        label={
          allSelectedAreTransfer
            ? "Unmark selected transfers"
            : "Mark selected transactions as transfers"
        }
        onClick={() =>
          onSetTransactionType(selectedIds, allSelectedAreTransfer ? "regular" : "transfer")
        }
        pressed={allSelectedAreTransfer}
        variant="warning"
      >
        <RepeatIcon size={20} />
      </FloatingSelectionToolbarButton>
      <FloatingSelectionToolbarButton
        label={reviewLabel}
        onClick={() => onSetReviewed(selectedIds, !allSelectedAreReviewed)}
        pressed={allSelectedAreReviewed}
        variant="review"
      >
        <CheckIcon size={20} />
      </FloatingSelectionToolbarButton>
      <Dropdown>
        <DropdownTrigger
          aria-label="Selected transaction actions"
          className={floatingSelectionButtonClass()}
        >
          <MoreVerticalIcon size={21} />
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label="Selected transaction actions">
            <DropdownItem key="select-all" onAction={onSelectAll}>
              Select all visible
            </DropdownItem>
            <DropdownItem key="clear" onAction={onClearSelection}>
              Clear selection
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </FloatingSelectionToolbar>
  );

  return typeof document === "undefined" ? toolbar : createPortal(toolbar, document.body);
}
