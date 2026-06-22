import type { AmountRangeFilter, DateRangeFilter } from "./transactions.types";
import { StyledCheckbox } from "./transactions.controls";
import {
  AmountRangeFilterButton,
  CategoryFilterSelect,
  DateRangeFilterButton,
  ToolbarSearchField,
  type CategoryFilterOption,
  type OptionalColumnOption,
} from "./TransactionsToolbarControls";
import { TransactionsColumnSettings } from "./TransactionsColumnSettings";

export function TransactionsToolbar({
  allSelected,
  amountFilter,
  categoryFilter,
  categorySearch,
  dateFilter,
  filteredCategoryFilterOptions,
  onAmountFilterChange,
  onCategoryFilterChange,
  onCategorySearchChange,
  onColumnOrderChange,
  onDateFilterChange,
  onSelectAll,
  onTableSearchChange,
  onVisibleOptionalColumnIdsChange,
  optionalColumnOptions,
  selectAllPages,
  selectedCategoryFilterLabel,
  tableSearch,
  transactionColumnOrderOptions,
  visibleColumnOrder,
  visibleOptionalColumnIds,
}: {
  allSelected: boolean;
  amountFilter: AmountRangeFilter;
  categoryFilter: string;
  categorySearch: string;
  dateFilter: DateRangeFilter;
  filteredCategoryFilterOptions: CategoryFilterOption[];
  onAmountFilterChange: (value: AmountRangeFilter) => void;
  onCategoryFilterChange: (value: string) => void;
  onCategorySearchChange: (value: string) => void;
  onColumnOrderChange: (ids: string[]) => void;
  onDateFilterChange: (value: DateRangeFilter) => void;
  onSelectAll: () => void;
  onTableSearchChange: (value: string) => void;
  onVisibleOptionalColumnIdsChange: (ids: string[]) => void;
  optionalColumnOptions: readonly OptionalColumnOption[];
  selectAllPages: boolean;
  selectedCategoryFilterLabel: string;
  tableSearch: string;
  transactionColumnOrderOptions: readonly OptionalColumnOption[];
  visibleColumnOrder: string[];
  visibleOptionalColumnIds: string[];
}) {
  return (
    <div className="flex min-w-max items-center justify-between gap-4 p-1">
      <div className="flex min-w-[18rem] flex-1 items-center gap-2">
        <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-divider/60 bg-default-50/70 text-foreground transition-colors hover:bg-default">
          <StyledCheckbox
            checked={selectAllPages || allSelected}
            onChange={() => onSelectAll()}
            aria-label="Select transactions"
          />
        </label>
        <ToolbarSearchField value={tableSearch} onChange={onTableSearchChange} />
      </div>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
        <CategoryFilterSelect
          categoryFilter={categoryFilter}
          categorySearch={categorySearch}
          filteredCategoryFilterOptions={filteredCategoryFilterOptions}
          onCategoryFilterChange={onCategoryFilterChange}
          onCategorySearchChange={onCategorySearchChange}
          selectedCategoryFilterLabel={selectedCategoryFilterLabel}
        />

        <DateRangeFilterButton
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
        />

        <AmountRangeFilterButton
          amountFilter={amountFilter}
          onAmountFilterChange={onAmountFilterChange}
        />

        <TransactionsColumnSettings
          columnOrderOptions={transactionColumnOrderOptions}
          optionalColumnOptions={optionalColumnOptions}
          visibleColumnOrder={visibleColumnOrder}
          visibleOptionalColumnIds={visibleOptionalColumnIds}
          onColumnOrderChange={onColumnOrderChange}
          onVisibleOptionalColumnIdsChange={onVisibleOptionalColumnIdsChange}
        />

      </div>
    </div>
  );
}
