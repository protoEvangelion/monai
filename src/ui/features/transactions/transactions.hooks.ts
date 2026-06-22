import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "@tanstack/react-router";
import type { Table } from "@tanstack/react-table";
import { createCategory } from "../../../server/categories.fns";
import { AI_CATEGORIZE_MAX_TRANSACTIONS } from "../../../server/plaid.sync.fns";
import { setTransactionType, updateTransactionCategory } from "../../../server/transactions.fns";
import type { AmountRangeFilter, CategoryGroup, DateRangeFilter, Tx } from "./transactions.types";

export const OPTIONAL_TRANSACTION_COLUMNS = [
  { id: "note", label: "Note" },
  { id: "merchantName", label: "Merchant" },
  { id: "datetime", label: "Datetime" },
  { id: "location", label: "Location" },
] as const;

export const TRANSACTION_COLUMN_ORDER_OPTIONS = [
  { id: "date", label: "Date" },
  { id: "name", label: "Name" },
  { id: "note", label: "Note" },
  { id: "category", label: "Category" },
  { id: "amount", label: "Amount" },
  { id: "merchantName", label: "Merchant" },
  { id: "datetime", label: "Datetime" },
  { id: "location", label: "Location" },
] as const;

export const DEFAULT_TRANSACTION_COLUMN_ORDER = [
  "select",
  ...TRANSACTION_COLUMN_ORDER_OPTIONS.map((column) => column.id),
  "status",
  "reviewStatus",
];

export const DEFAULT_TRANSACTION_COLUMN_VISIBILITY = {
  reviewStatus: false,
  note: false,
  merchantName: false,
  datetime: false,
  location: false,
};

export function useTransactionFilterOptions({
  amountFilter,
  categories,
  categoryFilter,
  categorySearch,
  dateFilter,
  showAll,
}: {
  amountFilter: AmountRangeFilter;
  categories: CategoryGroup[];
  categoryFilter: string;
  categorySearch: string;
  dateFilter: DateRangeFilter;
  showAll: boolean;
}) {
  const categoryOptions = useMemo(
    () => categories.flatMap((group) => group.children),
    [categories],
  );
  const categoryFilterOptions = useMemo(
    () => [
      { id: "all", label: "All categories" },
      { id: "uncategorized", label: "Uncategorized" },
      { id: "income", label: "Income" },
      { id: "transfer", label: "Transfer" },
      ...categoryOptions.map((category) => ({
        id: `cat:${category.id}`,
        label: `${category.icon} ${category.name}`,
      })),
    ],
    [categoryOptions],
  );
  const filteredCategoryFilterOptions = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categoryFilterOptions;
    return categoryFilterOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [categoryFilterOptions, categorySearch]);
  const selectedCategoryFilterLabel =
    categoryFilterOptions.find((option) => option.id === categoryFilter)?.label ?? "All categories";
  const columnFilters = useMemo(
    () => [
      { id: "reviewStatus", value: showAll ? "all" : "not-reviewed" },
      ...(categoryFilter === "all" ? [] : [{ id: "category", value: categoryFilter }]),
      ...(dateFilter ? [{ id: "date", value: dateFilter }] : []),
      ...(amountFilter ? [{ id: "amount", value: amountFilter }] : []),
    ],
    [amountFilter, categoryFilter, dateFilter, showAll],
  );

  return {
    columnFilters,
    filteredCategoryFilterOptions,
    selectedCategoryFilterLabel,
  };
}

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useTransactionActionSelection({
  rowSelection,
  selectAllPages,
  setRowSelection,
  setSelectAllPages,
  table,
  totalRows,
}: {
  rowSelection: Record<string, boolean>;
  selectAllPages: boolean;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectAllPages: Dispatch<SetStateAction<boolean>>;
  table: Table<Tx>;
  totalRows?: number;
}) {
  const filteredRows = table.getFilteredRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const allFilteredIds = filteredRows.map((row) => row.original.id);
  const cappedTransactionIds = allFilteredIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS);
  const selectedIds = Object.entries(rowSelection)
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => Number(id))
    .filter(Number.isFinite);
  const allSelected =
    cappedTransactionIds.length > 0 && cappedTransactionIds.every((id) => rowSelection[String(id)]);
  const markIds = selectAllPages
    ? cappedTransactionIds
    : selectedIds.length > 0
      ? selectedIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS)
      : pageRows.map((row) => row.original.id);
  const actionIds = markIds;
  const aiTransactionCount = Math.min(actionIds.length, AI_CATEGORIZE_MAX_TRANSACTIONS);
  const aiCountLabel =
    actionIds.length > aiTransactionCount
      ? `${aiTransactionCount}/${actionIds.length}`
      : aiTransactionCount;
  const total = totalRows ?? filteredRows.length;

  const toggleAll = () => {
    if (allSelected || selectAllPages) {
      setSelectAllPages(false);
      setRowSelection({});
      return;
    }

    setSelectAllPages(true);
    setRowSelection(Object.fromEntries(cappedTransactionIds.map((id) => [String(id), true])));
  };

  return {
    actionIds,
    aiCountLabel,
    aiTransactionCount,
    allSelected,
    cappedTransactionIds,
    pageRows,
    selectedIds,
    toggleAll,
    total,
  };
}

export function useTransactionCategoryActions({
  categories,
  onClosePicker,
}: {
  categories: CategoryGroup[];
  onClosePicker: () => void;
}) {
  const router = useRouter();
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [createTxId, setCreateTxId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("🏷️");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const getParentGroupId = (catId: number | null | undefined) => {
    if (!catId) return categories[0]?.id ?? null;
    return (
      categories.find((group) => group.children.some((category) => category.id === catId))?.id ??
      categories[0]?.id ??
      null
    );
  };

  const handleCategoryChange = async (txId: number, categoryId: number | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateTransactionCategory as any)({
      data: { id: txId, categoryId },
    });
    onClosePicker();
    router.invalidate();
  };

  const handleTransactionTypeChange = async (
    txId: number,
    transactionType: "income" | "transfer",
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (setTransactionType as any)({
      data: { id: txId, transactionType },
    });
    onClosePicker();
    router.invalidate();
  };

  const openCreateCategoryModal = (tx: Tx) => {
    setCreateTxId(tx.id);
    setNewCategoryName(tx.merchantName);
    setNewCategoryIcon(tx.category?.icon ?? "🏷️");
    setNewCategoryBudget("");
    setNewCategoryParentId(getParentGroupId(tx.category?.id));
    onClosePicker();
    setIsCreateCategoryOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || newCategoryParentId === null) return;
    setIsCreatingCategory(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (createCategory as any)({
        data: {
          name: newCategoryName.trim(),
          icon: newCategoryIcon.trim() || "🏷️",
          budgetAmount: parseFloat(newCategoryBudget) || 0,
          parentId: newCategoryParentId,
        },
      });

      if (createTxId && created?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateTransactionCategory as any)({
          data: { id: createTxId, categoryId: created.id },
        });
      }

      setIsCreateCategoryOpen(false);
      setCreateTxId(null);
      router.invalidate();
    } finally {
      setIsCreatingCategory(false);
    }
  };

  return {
    handleCategoryChange,
    handleCreateCategory,
    handleTransactionTypeChange,
    isCreateCategoryOpen,
    isCreatingCategory,
    newCategoryBudget,
    newCategoryIcon,
    newCategoryName,
    newCategoryParentId,
    openCreateCategoryModal,
    setIsCreateCategoryOpen,
    setNewCategoryBudget,
    setNewCategoryIcon,
    setNewCategoryName,
    setNewCategoryParentId,
  };
}
