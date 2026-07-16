import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import {
  type ColumnFiltersState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { useMantineReactTable } from "mantine-react-table";
import { useTransactionReviewActions } from "./transactions.actions";
import { CreateCategoryFromTransactionModal } from "./CreateCategoryFromTransactionModal";
import { TransactionsMantineGrid } from "./TransactionsMantineGrid";
import { TransactionSelectionToolbar } from "./TransactionSelectionToolbar";
import {
  useTransactionActionSelection,
  useTransactionCategoryActions,
  useTransactionTableColumnPrefs,
} from "./transactions.hooks";
import type {
  CategoryGroup,
  TransactionTableServerState,
  Tx,
} from "./transactions.types";
import {
  applyLocalColumnFilters,
  LOCAL_COLUMN_FILTER_IDS,
} from "./transactions.utils";
import { useSelectedToolbarTransactions } from "./transactions.selection.hooks";
import { useTransactionTableState } from "./transactions.table-state.hooks";
import {
  createMrtTransactionColumns,
  monthDateRangeFilter,
  type TransactionTableVariant,
} from "./transactions.mantine-columns";
import { CategoryTransactionsBulkBar } from "../categories/CategoryTransactionsBulkBar";
import type { getCategories } from "../../../server/categories.fns";
import {
  setTransactionsInternalTransfer,
  setTransactionsType,
  updateTransactionsCategory,
} from "../../../server/transactions.fns";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];

function toMrtColumnFilters({
  amountFilter,
  categoryFilter,
  dateFilter,
  lockedDateRange,
  lockedCategoryFilter,
  maxAmount,
  search,
  showAll,
  variant,
}: {
  amountFilter: { min: string; max: string } | null;
  categoryFilter: string;
  dateFilter: { start: string; end: string } | null;
  lockedCategoryFilter?: string;
  lockedDateRange?: [string, string];
  maxAmount: number;
  search: string;
  showAll: boolean;
  variant: TransactionTableVariant;
}): ColumnFiltersState {
  const filters: ColumnFiltersState =
    variant === "category"
      ? []
      : [{ id: "reviewStatus", value: showAll ? "all" : "not-reviewed" }];

  const categoryValue = lockedCategoryFilter ?? categoryFilter;
  if (categoryValue && categoryValue !== "all") {
    filters.push({ id: "category", value: categoryValue });
  }

  const dateValue = lockedDateRange ?? (dateFilter ? [dateFilter.start, dateFilter.end] : null);
  if (dateValue) {
    filters.push({
      id: "date",
      value: [new Date(dateValue[0]), new Date(dateValue[1])],
    });
  }

  if (amountFilter && (amountFilter.min || amountFilter.max)) {
    filters.push({
      id: "amount",
      value: [
        Number(amountFilter.min) || 0,
        Number(amountFilter.max) || Math.max(100, Math.ceil(maxAmount)),
      ],
    });
  }

  if (search.trim()) {
    filters.push({ id: "name", value: search.trim() });
  }

  return filters;
}

function dateStringsFromFilterValue(value: unknown) {
  if (!Array.isArray(value)) return null;
  const [start, end] = value;
  const startStr =
    start instanceof Date
      ? start.toISOString().slice(0, 10)
      : typeof start === "string"
        ? start
        : "";
  const endStr =
    end instanceof Date ? end.toISOString().slice(0, 10) : typeof end === "string" ? end : "";
  return startStr && endStr ? { start: startStr, end: endStr } : null;
}

function filterValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => filterValueEqual(item, b[index]));
  }
  return false;
}

function columnFiltersEqual(a: ColumnFiltersState, b: ColumnFiltersState) {
  if (a.length !== b.length) return false;
  return a.every(
    (filter, index) =>
      filter.id === b[index]?.id && filterValueEqual(filter.value, b[index]?.value),
  );
}

export function ReviewTable({
  categories,
  categoryBulkGroups,
  initialCategoryFilter,
  lockedCategoryFilter,
  onCategoryRefresh,
  searchQuery = "",
  serverState,
  showAll = false,
  transactions,
  variant = "full",
  viewDate,
}: {
  transactions: Tx[];
  categories: CategoryGroup[];
  showAll?: boolean;
  searchQuery?: string;
  serverState?: TransactionTableServerState;
  variant?: TransactionTableVariant;
  viewDate?: string;
  initialCategoryFilter?: string;
  lockedCategoryFilter?: string;
  categoryBulkGroups?: LoadedGroup[];
  onCategoryRefresh?: () => void;
}) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const rowSelectionRef = useRef(rowSelection);
  rowSelectionRef.current = rowSelection;
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [pickerTxId, setPickerTxId] = useState<number | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [categorySaving, setCategorySaving] = useState(false);
  const isCategoryVariant = variant === "category";
  const categoryColumnOrder = useMemo(
    () =>
      lockedCategoryFilter
        ? ["select", "date", "name", "amount"]
        : ["select", "date", "name", "amount", "category"],
    [lockedCategoryFilter],
  );
  const { columnOrder, columnVisibility, setColumnOrder, setColumnVisibility } =
    useTransactionTableColumnPrefs();
  const tableColumnOrder = isCategoryVariant ? categoryColumnOrder : columnOrder;
  const tableColumnVisibility = isCategoryVariant ? {} : columnVisibility;
  const {
    amountFilter,
    categoryFilter,
    dateFilter,
    debouncedTableSearch,
    handleAmountFilterChange,
    handleCategoryFilterChange,
    handleDateFilterChange,
    handlePaginationChange,
    isServerMode,
    pagination,
    setSearchInput,
  } = useTransactionTableState({
    searchQuery,
    serverState,
    setRowSelection,
    setSelectAllPages,
    showAll,
  });

  const lockedDateRange = useMemo(
    () => (viewDate ? (monthDateRangeFilter(viewDate) as [string, string]) : undefined),
    [viewDate],
  );
  const effectiveCategoryFilter = lockedCategoryFilter ?? initialCategoryFilter ?? categoryFilter;
  const maxAmount = useMemo(
    () => Math.max(0, ...transactions.map((tx) => Math.abs(tx.amount))),
    [transactions],
  );

  const serverColumnFilters = useMemo(
    () =>
      toMrtColumnFilters({
        amountFilter,
        categoryFilter: effectiveCategoryFilter,
        dateFilter,
        lockedCategoryFilter,
        lockedDateRange,
        maxAmount,
        search: debouncedTableSearch,
        showAll,
        variant,
      }),
    [
      amountFilter,
      dateFilter,
      debouncedTableSearch,
      effectiveCategoryFilter,
      lockedCategoryFilter,
      lockedDateRange,
      maxAmount,
      showAll,
      variant,
    ],
  );

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(serverColumnFilters);

  useEffect(() => {
    setColumnFilters((prev) => {
      const localFilters = prev.filter((filter) =>
        LOCAL_COLUMN_FILTER_IDS.includes(filter.id as (typeof LOCAL_COLUMN_FILTER_IDS)[number]),
      );
      const next = [...serverColumnFilters, ...localFilters];
      if (columnFiltersEqual(prev, next)) return prev;
      return next;
    });
  }, [serverColumnFilters]);

  const tableData = useMemo(() => {
    if (!isServerMode) return transactions;
    return applyLocalColumnFilters(transactions, columnFilters);
  }, [columnFilters, isServerMode, transactions]);

  const categoryActions = useTransactionCategoryActions({
    categories,
    onClosePicker: () => {
      setPickerTxId(null);
      setCatSearch("");
    },
  });

  const filteredGroups = useMemo(
    () =>
      catSearch
        ? categories
            .map((group) => ({
              ...group,
              children: group.children.filter((category) =>
                category.name.toLowerCase().includes(catSearch.toLowerCase()),
              ),
            }))
            .filter((group) => group.children.length > 0)
        : categories,
    [catSearch, categories],
  );

  const columns = useMemo(
    () =>
      createMrtTransactionColumns({
        categories,
        catSearch,
        filteredGroups,
        lockedCategoryFilter,
        lockedDateRange,
        maxAmount,
        onCategoryChange: categoryActions.handleCategoryChange,
        onCategorySearchChange: setCatSearch,
        onCreateCategory: categoryActions.openCreateCategoryModal,
        onPickerTxIdChange: setPickerTxId,
        onTransactionTypeChange: categoryActions.handleTransactionTypeChange,
        pickerTxId,
        variant,
      }),
    [
      catSearch,
      filteredGroups,
      lockedCategoryFilter,
      lockedDateRange,
      maxAmount,
      pickerTxId,
      categories,
      variant,
      categoryActions,
    ],
  );

  const handleColumnFiltersChange = useCallback(
    (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      setColumnFilters((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (columnFiltersEqual(prev, next)) return prev;

        const category = next.find((filter) => filter.id === "category");
        const date = next.find((filter) => filter.id === "date");
        const amount = next.find((filter) => filter.id === "amount");
        const name = next.find((filter) => filter.id === "name");

        if (!lockedCategoryFilter && category) {
          handleCategoryFilterChange(String(category.value ?? "all"));
        }
        if (!lockedDateRange && date) {
          handleDateFilterChange(dateStringsFromFilterValue(date.value));
        }
        if (Array.isArray(amount?.value)) {
          const [min, max] = amount.value as [number, number];
          handleAmountFilterChange(
            min || max ? { min: min ? String(min) : "", max: max ? String(max) : "" } : null,
          );
        }
        if (name !== undefined) {
          setSearchInput(String(name.value ?? ""));
        } else if (prev.some((filter) => filter.id === "name")) {
          setSearchInput("");
        }

        return next;
      });
    },
    [
      handleAmountFilterChange,
      handleCategoryFilterChange,
      handleDateFilterChange,
      lockedCategoryFilter,
      lockedDateRange,
      setSearchInput,
    ],
  );

  const table = useMantineReactTable({
    columns,
    data: tableData,
    getRowId: (row) => String(row.id),
    enableColumnActions: false,
    enableColumnResizing: true,
    enableColumnOrdering: !isCategoryVariant,
    enableHiding: !isCategoryVariant,
    enableSorting: true,
    enableColumnFilters: true,
    enableGlobalFilter: false,
    enablePagination: !isCategoryVariant,
    enableRowSelection: true,
    enableSelectAll: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableStickyHeader: true,
    columnFilterDisplayMode: "subheader",
    layoutMode: "grid",
    initialState: {
      density: isCategoryVariant ? "xs" : "md",
      showColumnFilters: true,
      columnSizing: {
        reviewStatus: 96,
      },
      columnVisibility: isCategoryVariant
        ? {}
        : {
            note: false,
            merchantName: false,
            datetime: false,
            location: false,
            ...columnVisibility,
          },
      columnOrder: tableColumnOrder,
    },
    state: {
      columnFilters,
      columnOrder: tableColumnOrder,
      columnVisibility: tableColumnVisibility,
      pagination,
      rowSelection,
      sorting,
    },
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnOrderChange: isCategoryVariant ? undefined : setColumnOrder,
    onColumnVisibilityChange: isCategoryVariant ? undefined : setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: isServerMode,
    manualPagination: isServerMode,
    rowCount: serverState?.total,
    autoResetPageIndex: false,
    mantineSelectAllCheckboxProps: {
      "aria-label": "Select transactions",
      style: { cursor: "pointer" },
    },
    mantineSelectCheckboxProps: ({ row }) => ({
      "aria-label": `Select transaction ${row.original.merchantName}`,
      style: { cursor: "pointer" },
    }),
    mantineTableProps: {
      style: { tableLayout: "fixed" },
    },
    mantineTableHeadCellProps: {
      style: {
        alignItems: "flex-start",
        justifyContent: "flex-start",
        verticalAlign: "top",
      },
    },
    mantinePaperProps: {
      style: {
        border: "none",
        boxShadow: "none",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      },
    },
    mantineTableContainerProps: {
      style: { flex: 1, minHeight: 0, maxHeight: "100%" },
    },
    mantineTableBodyRowProps: ({ row }) =>
      ({
        "data-testid": `transaction-row-${row.original.id}`,
      }) as HTMLAttributes<HTMLTableRowElement>,
    positionToolbarAlertBanner: "none",
  });

  const { actionIds, aiTransactionCount, cappedTransactionIds, selectedIds } =
    useTransactionActionSelection({
      rowSelection,
      selectAllPages,
      setRowSelection,
      setSelectAllPages,
      table,
      totalRows: serverState?.total,
    });

  const {
    handleAICategorize,
    handleSetDate,
    handleSetCategory,
    handleSetReviewed,
    handleSetTransactionType,
    isAICategorizing,
    resetSelection,
  } = useTransactionReviewActions({
    actionIds,
    aiTransactionCount,
    setRowSelection,
    setSelectAllPages,
  });
  const selectedToolbarTransactions = useSelectedToolbarTransactions({
    cappedTransactionIds,
    selectAllPages,
    selectedIds,
    transactions,
  });
  const selectAllVisible = () => {
    setSelectAllPages(true);
    setRowSelection(Object.fromEntries(cappedTransactionIds.map((id) => [String(id), true])));
  };

  const categorySelectedTransactions = useMemo(
    () => transactions.filter((tx) => rowSelection[String(tx.id)]),
    [rowSelection, transactions],
  );
  const categoryAllSelectedAreInternal =
    categorySelectedTransactions.length > 0 &&
    categorySelectedTransactions.every((tx) => tx.transactionType === "transfer");

  const runCategoryMutation = async (fn: () => Promise<void>) => {
    setCategorySaving(true);
    try {
      await fn();
      onCategoryRefresh?.();
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <TransactionsMantineGrid table={table} />
      </div>

      {variant === "category" && categoryBulkGroups ? (
        <CategoryTransactionsBulkBar
          allSelectedAreInternal={categoryAllSelectedAreInternal}
          saving={categorySaving}
          selectedGroups={categoryBulkGroups}
          selectedTransactions={categorySelectedTransactions}
          onClearSelection={() => setRowSelection({})}
          onSelectAll={() =>
            setRowSelection(Object.fromEntries(transactions.map((tx) => [String(tx.id), true])))
          }
          onSetCategory={(ids, categoryId) =>
            runCategoryMutation(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (updateTransactionsCategory as any)({ data: { ids, categoryId } });
            })
          }
          onSetInternalTransfer={(ids, isInternalTransfer) =>
            runCategoryMutation(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (setTransactionsInternalTransfer as any)({ data: { ids, isInternalTransfer } });
            })
          }
          onSetTransactionType={(ids, transactionType) =>
            runCategoryMutation(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (setTransactionsType as any)({ data: { ids, transactionType } });
            })
          }
        />
      ) : (
        <TransactionSelectionToolbar
          categories={categories}
          isAICategorizing={isAICategorizing}
          selectedTransactions={selectedToolbarTransactions}
          showMarkReviewed={!showAll}
          onAICategorize={handleAICategorize}
          onClearSelection={resetSelection}
          onSelectAll={selectAllVisible}
          onSetCategory={handleSetCategory}
          onSetDate={handleSetDate}
          onSetReviewed={handleSetReviewed}
          onSetTransactionType={handleSetTransactionType}
        />
      )}

      <CreateCategoryFromTransactionModal
        categories={categories}
        isCreatingCategory={categoryActions.isCreatingCategory}
        isOpen={categoryActions.isCreateCategoryOpen}
        newCategoryBudget={categoryActions.newCategoryBudget}
        newCategoryIcon={categoryActions.newCategoryIcon}
        newCategoryName={categoryActions.newCategoryName}
        newCategoryParentId={categoryActions.newCategoryParentId}
        onCreate={categoryActions.handleCreateCategory}
        onOpenChange={(open) => {
          if (!open && !categoryActions.isCreatingCategory) {
            categoryActions.setIsCreateCategoryOpen(false);
          }
        }}
        setNewCategoryBudget={categoryActions.setNewCategoryBudget}
        setNewCategoryIcon={categoryActions.setNewCategoryIcon}
        setNewCategoryName={categoryActions.setNewCategoryName}
        setNewCategoryParentId={categoryActions.setNewCategoryParentId}
      />

    </div>
  );
}
