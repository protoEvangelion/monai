import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ListFilterIcon,
  Loader2Icon,
  MoreVerticalIcon,
  RepeatIcon,
  SparklesIcon,
  SplitIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { CategoryActionPicker } from "../categories/CategoryActionPicker";
import {
  FloatingSelectionToolbar,
  FloatingSelectionToolbarButton,
  floatingSelectionButtonClass,
} from "../../shared/FloatingSelectionToolbar";
import type { CategoryGroup, Tx } from "./transactions.types";
import { dateInputValue } from "./transactions.utils";

function isSplittable(tx: Tx) {
  return tx.transactionType !== "transfer" && tx.splitParentId == null;
}

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
  onSplit,
  selectedTransactions,
  showMarkReviewed = true,
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
  onSplit: (transaction: Tx) => void;
  selectedTransactions: Tx[];
  showMarkReviewed?: boolean;
}) {
  const navigate = useNavigate();
  if (selectedTransactions.length === 0) return null;

  const selectedIds = selectedTransactions.map((tx) => tx.id);
  const browserAiEnabled = import.meta.env.VITE_ENABLE_BROWSER_AI === "1";
  const firstSelectedDate = selectedTransactions[0]?.date
    ? dateInputValue(selectedTransactions[0].date)
    : "";
  const allSelectedAreTransfer = selectedTransactions.every(
    (tx) => tx.transactionType === "transfer",
  );
  const allSelectedAreReviewed = selectedTransactions.every((tx) => tx.isReviewed);
  const reviewLabel = allSelectedAreReviewed ? "Mark unreviewed" : "Mark reviewed";
  const canSplit =
    selectedTransactions.length === 1 && isSplittable(selectedTransactions[0]);
  const rulePattern =
    selectedTransactions.length === 1
      ? selectedTransactions[0].merchantName
      : selectedTransactions[0]?.merchantName ?? "";

  const toolbar = (
    <FloatingSelectionToolbar
      count={selectedTransactions.length}
      onClearSelection={onClearSelection}
    >
      {browserAiEnabled ? (
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
      ) : null}
      <FloatingSelectionToolbarButton
        label="Add rule from selection"
        onClick={() =>
          navigate({
            to: "/rules",
            search: { pattern: rulePattern },
          })
        }
      >
        <ListFilterIcon size={20} />
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
        label={
          canSplit
            ? "Split transaction"
            : "Select exactly one non-transfer transaction to split"
        }
        onClick={() => {
          if (!canSplit) return;
          onSplit(selectedTransactions[0]);
        }}
        disabled={!canSplit}
      >
        <SplitIcon size={20} />
      </FloatingSelectionToolbarButton>
      {showMarkReviewed ? (
        <FloatingSelectionToolbarButton
          label={reviewLabel}
          onClick={() => onSetReviewed(selectedIds, !allSelectedAreReviewed)}
          pressed={allSelectedAreReviewed}
          variant="review"
        >
          <CheckIcon size={20} />
        </FloatingSelectionToolbarButton>
      ) : null}
      <Dropdown>
        <DropdownTrigger>
          <Button
            isIconOnly
            variant="ghost"
            aria-label="Selected transaction actions"
            className={floatingSelectionButtonClass()}
          >
            <MoreVerticalIcon size={21} />
          </Button>
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
