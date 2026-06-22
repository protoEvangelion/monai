import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from "@heroui/react";
import { Loader2Icon, MoreVerticalIcon, RepeatIcon } from "lucide-react";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import {
  FloatingSelectionToolbar,
  FloatingSelectionToolbarButton,
  floatingSelectionButtonClass,
} from "../../shared/FloatingSelectionToolbar";
import { CategoryActionPicker } from "./CategoryActionPicker";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];

export function CategoryTransactionsBulkBar({
  allSelectedAreInternal,
  onClearSelection,
  onSelectAll,
  onSetCategory,
  onSetInternalTransfer,
  onSetTransactionType,
  saving,
  selectedGroups,
  selectedTransactions,
}: {
  allSelectedAreInternal: boolean;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onSetCategory: (ids: number[], categoryId: number | null) => void;
  onSetInternalTransfer: (ids: number[], isInternalTransfer: boolean) => void;
  onSetTransactionType: (ids: number[], transactionType: "income" | "transfer") => void;
  saving: boolean;
  selectedGroups: LoadedGroup[];
  selectedTransactions: LoadedTransaction[];
}) {
  if (selectedTransactions.length === 0) return null;

  const selectedIds = selectedTransactions.map((tx) => tx.id);

  return (
    <FloatingSelectionToolbar
      count={selectedTransactions.length}
      onClearSelection={onClearSelection}
    >
      {saving ? <Loader2Icon size={16} className="animate-spin text-default-400" /> : null}
      <CategoryActionPicker
        categories={selectedGroups}
        selectedCategoryId={selectedTransactions[0]?.categoryId ?? null}
        selectedTransactionType={selectedTransactions[0]?.transactionType ?? "regular"}
        ariaLabel="Change selected categories"
        triggerClassName={floatingSelectionButtonClass()}
        onTypeChange={(transactionType) => onSetTransactionType(selectedIds, transactionType)}
        onChange={(categoryId) => onSetCategory(selectedIds, categoryId)}
      />
      <FloatingSelectionToolbarButton
        label={
          allSelectedAreInternal
            ? "Unmark selected internal transfers"
            : "Mark selected internal transfers"
        }
        onClick={() => onSetInternalTransfer(selectedIds, !allSelectedAreInternal)}
        pressed={allSelectedAreInternal}
        variant="warning"
      >
        <RepeatIcon size={20} />
      </FloatingSelectionToolbarButton>
      <Dropdown>
        <DropdownTrigger
          aria-label="Bulk transaction actions"
          className={floatingSelectionButtonClass()}
        >
          <MoreVerticalIcon size={21} />
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label="Bulk transaction actions">
            <DropdownItem key="select-all" onAction={onSelectAll}>
              Select all
            </DropdownItem>
            <DropdownItem key="clear" onAction={onClearSelection}>
              Unselect all
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </FloatingSelectionToolbar>
  );
}
