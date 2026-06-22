import { useCallback, useMemo, useRef, useState } from "react";
import {
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useTransactionReviewActions } from "./transactions.actions";
import { createTransactionColumns } from "./transactions.columns";
import { CreateCategoryFromTransactionModal } from "./CreateCategoryFromTransactionModal";
import { TransactionsDataGrid } from "./TransactionsDataGrid";
import { TransactionSelectionToolbar } from "./TransactionSelectionToolbar";
import { TransactionNoteModal } from "./TransactionNoteModal";
import {
  DEFAULT_TRANSACTION_COLUMN_ORDER,
  DEFAULT_TRANSACTION_COLUMN_VISIBILITY,
  OPTIONAL_TRANSACTION_COLUMNS,
  TRANSACTION_COLUMN_ORDER_OPTIONS,
  useTransactionActionSelection,
  useTransactionCategoryActions,
  useTransactionFilterOptions,
} from "./transactions.hooks";
import type {
  CategoryGroup,
  TransactionTableServerState,
  Tx,
} from "./transactions.types";
import { TransactionsToolbar } from "./TransactionsToolbar";
import { transactionSearchFilter } from "./transactions.utils";
import { useSelectedToolbarTransactions } from "./transactions.selection.hooks";
import { TransactionsEmptyState } from "./TransactionsEmptyState";
import { useTransactionTableState } from "./transactions.table-state.hooks";

export function ReviewTable({
  transactions,
  categories,
  showAll = false,
  searchQuery = "",
  serverState,
}: {
  transactions: Tx[];
  categories: CategoryGroup[];
  showAll?: boolean;
  searchQuery?: string;
  serverState?: TransactionTableServerState;
}) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const rowSelectionRef = useRef(rowSelection);
  rowSelectionRef.current = rowSelection;
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [pickerTxId, setPickerTxId] = useState<number | null>(null);
  const [noteTransaction, setNoteTransaction] = useState<Tx | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [columnOrder, setColumnOrder] = useState(DEFAULT_TRANSACTION_COLUMN_ORDER);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_TRANSACTION_COLUMN_VISIBILITY,
  );
  const {
    amountFilter,
    categoryFilter,
    categorySearch,
    dateFilter,
    debouncedTableSearch,
    handleAmountFilterChange,
    handleCategoryFilterChange,
    handleDateFilterChange,
    handlePaginationChange,
    isServerMode,
    pagination,
    searchInput,
    setCategorySearch,
    setSearchInput,
  } = useTransactionTableState({
    searchQuery,
    serverState,
    setRowSelection,
    setSelectAllPages,
    showAll,
  });
  const { columnFilters, filteredCategoryFilterOptions, selectedCategoryFilterLabel } =
    useTransactionFilterOptions({
      amountFilter,
      categories,
      categoryFilter,
      categorySearch,
      dateFilter,
      showAll,
    });
  const categoryActions = useTransactionCategoryActions({
    categories,
    onClosePicker: () => {
      setPickerTxId(null);
      setCatSearch("");
    },
  });
  const isRowSelected = useCallback(
    (txId: number) => Boolean(rowSelectionRef.current[String(txId)]),
    [],
  );
  const handleRowSelectionChange = useCallback((txId: number, checked: boolean) => {
    setRowSelection((current) => {
      const key = String(txId);
      if (checked) return { ...current, [key]: true };
      const { [key]: _removed, ...next } = current;
      return next;
    });
  }, []);

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
      createTransactionColumns({
        categories,
        catSearch,
        filteredGroups,
        onCategoryChange: categoryActions.handleCategoryChange,
        onCategorySearchChange: setCatSearch,
        onCreateCategory: categoryActions.openCreateCategoryModal,
        onPickerTxIdChange: setPickerTxId,
        onRowSelectStart: () => setSelectAllPages(false),
        onRowSelectionChange: handleRowSelectionChange,
        onTransactionTypeChange: categoryActions.handleTransactionTypeChange,
        isRowSelected,
        pickerTxId,
      }),
    [catSearch, filteredGroups, handleRowSelectionChange, isRowSelected, pickerTxId, categories],
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (row) => String(row.id),
    state: {
      columnFilters,
      columnOrder,
      columnVisibility,
      globalFilter: debouncedTableSearch,
      pagination,
    },
    globalFilterFn: transactionSearchFilter,
    onGlobalFilterChange: setSearchInput,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualFiltering: isServerMode,
    manualPagination: isServerMode,
    rowCount: serverState?.total,
    autoResetPageIndex: false,
  });

  const {
    actionIds,
    aiTransactionCount,
    allSelected,
    cappedTransactionIds,
    pageRows,
    selectedIds,
    toggleAll,
    total,
  } = useTransactionActionSelection({
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
  const selectedToolbarTransactions = useSelectedToolbarTransactions({ cappedTransactionIds, selectAllPages, selectedIds, transactions });
  const selectAllVisible = () => {
    setSelectAllPages(true);
    setRowSelection(Object.fromEntries(cappedTransactionIds.map((id) => [String(id), true])));
  };

  return (
    <div className="flex min-h-0 flex-col">
      <TransactionsToolbar
        allSelected={allSelected}
        amountFilter={amountFilter}
        categoryFilter={categoryFilter}
        categorySearch={categorySearch}
        dateFilter={dateFilter}
        filteredCategoryFilterOptions={filteredCategoryFilterOptions}
        onAmountFilterChange={handleAmountFilterChange}
        onCategoryFilterChange={handleCategoryFilterChange}
        onCategorySearchChange={setCategorySearch}
        onColumnOrderChange={(ids) =>
          setColumnOrder(["select", ...ids, "status", "reviewStatus"])
        }
        onDateFilterChange={handleDateFilterChange}
        onSelectAll={toggleAll}
        onTableSearchChange={setSearchInput}
        onVisibleOptionalColumnIdsChange={(ids) =>
          setColumnVisibility((current) => ({
            ...current,
            ...Object.fromEntries(
              OPTIONAL_TRANSACTION_COLUMNS.map((column) => [column.id, ids.includes(column.id)]),
            ),
            reviewStatus: false,
          }))
        }
        optionalColumnOptions={OPTIONAL_TRANSACTION_COLUMNS}
        selectAllPages={selectAllPages}
        selectedCategoryFilterLabel={selectedCategoryFilterLabel}
        tableSearch={searchInput}
        transactionColumnOrderOptions={TRANSACTION_COLUMN_ORDER_OPTIONS}
        visibleColumnOrder={columnOrder.filter((id) =>
          TRANSACTION_COLUMN_ORDER_OPTIONS.some((column) => column.id === id),
        )}
        visibleOptionalColumnIds={OPTIONAL_TRANSACTION_COLUMNS
          .filter((column) => table.getColumn(column.id)?.getIsVisible() ?? false)
          .map((column) => column.id)}
      />

      {total === 0 ? (
        <TransactionsEmptyState
          amountFilter={amountFilter}
          categoryFilter={categoryFilter}
          dateFilter={dateFilter}
          searchInput={searchInput}
          showAll={showAll}
        />
      ) : (
        <TransactionsDataGrid
          columnRenderKey={columns}
          onOpenTransaction={setNoteTransaction}
          pageRows={pageRows}
          pagination={pagination}
          rowSelection={rowSelection}
          table={table}
          total={total}
        />
      )}

      <TransactionSelectionToolbar
        categories={categories}
        isAICategorizing={isAICategorizing}
        selectedTransactions={selectedToolbarTransactions}
        onAICategorize={handleAICategorize}
        onClearSelection={resetSelection}
        onSelectAll={selectAllVisible}
        onSetCategory={handleSetCategory}
        onSetDate={handleSetDate}
        onSetReviewed={handleSetReviewed}
        onSetTransactionType={handleSetTransactionType}
      />

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

      {noteTransaction ? (
        <TransactionNoteModal
          key={noteTransaction.id}
          transaction={noteTransaction}
          onClose={() => setNoteTransaction(null)}
        />
      ) : null}
    </div>
  );
}
