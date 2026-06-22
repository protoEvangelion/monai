import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { PaginationState, Updater } from "@tanstack/react-table";
import type {
  AmountRangeFilter,
  DateRangeFilter,
  TransactionTableServerState,
} from "./transactions.types";
import { PAGE_SIZE } from "./transactions.utils";

export function useTransactionTableState({
  searchQuery,
  serverState,
  setRowSelection,
  setSelectAllPages,
  showAll,
}: {
  searchQuery: string;
  serverState?: TransactionTableServerState;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectAllPages: Dispatch<SetStateAction<boolean>>;
  showAll: boolean;
}) {
  const isServerMode = Boolean(serverState);
  const [pagination, setPagination] = useState({
    pageIndex: serverState?.pageIndex ?? 0,
    pageSize: serverState?.pageSize ?? PAGE_SIZE,
  });
  const [categorySearch, setCategorySearch] = useState("");
  const [searchInput, setSearchInput] = useState(serverState?.search ?? searchQuery);
  const [categoryFilter, setCategoryFilter] = useState(serverState?.categoryFilter ?? "all");
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>(serverState?.dateFilter ?? null);
  const [amountFilter, setAmountFilter] = useState<AmountRangeFilter>(
    serverState?.amountFilter ?? null,
  );
  const debouncedTableSearch = searchInput;

  useEffect(() => {
    if (!serverState) setSearchInput(searchQuery);
  }, [searchQuery, serverState]);

  useEffect(() => {
    if (!serverState) return;
    setSearchInput(serverState.search);
    setCategoryFilter(serverState.categoryFilter);
    setDateFilter(serverState.dateFilter);
    setAmountFilter(serverState.amountFilter);
    setPagination({ pageIndex: serverState.pageIndex, pageSize: serverState.pageSize });
  }, [
    serverState?.amountFilter,
    serverState?.categoryFilter,
    serverState?.dateFilter,
    serverState?.pageIndex,
    serverState?.pageSize,
    serverState?.search,
  ]);

  useEffect(() => {
    if (!isServerMode) setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setRowSelection({});
    setSelectAllPages(false);
  }, [
    amountFilter,
    categoryFilter,
    dateFilter,
    debouncedTableSearch,
    isServerMode,
    setRowSelection,
    setSelectAllPages,
    showAll,
  ]);

  useEffect(() => {
    if (!serverState || debouncedTableSearch === serverState.search) return;
    serverState.onQueryChange({ pageIndex: 0, search: debouncedTableSearch });
  }, [debouncedTableSearch, serverState?.onQueryChange, serverState?.search]);

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    setPagination((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      serverState?.onQueryChange({ pageIndex: next.pageIndex });
      return next;
    });
  };

  const handleAmountFilterChange = (value: AmountRangeFilter) => {
    setAmountFilter(value);
    serverState?.onQueryChange({
      amountMax: value?.max ?? "",
      amountMin: value?.min ?? "",
      pageIndex: 0,
    });
  };

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    serverState?.onQueryChange({ categoryFilter: value, pageIndex: 0 });
  };

  const handleDateFilterChange = (value: DateRangeFilter) => {
    setDateFilter(value);
    serverState?.onQueryChange({
      dateEnd: value?.end ?? "",
      dateStart: value?.start ?? "",
      pageIndex: 0,
    });
  };

  return {
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
  };
}
