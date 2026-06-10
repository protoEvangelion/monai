import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type ColumnDef,
  type FilterFn,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleOffIcon,
  Columns3Icon,
  Loader2Icon,
  PlusIcon,
  RepeatIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  Button,
  DateField,
  DateRangePicker,
  Dropdown,
  DropdownItem,
  DropdownItemIndicator,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Input,
  ListBox,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  SearchField,
  Select,
  RangeCalendar,
  Table,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { formatCurrency } from "../../lib/format";
import { createCategory } from "../../server/categories.fns";
import { AI_CATEGORIZE_MAX_TRANSACTIONS, runAICategorization } from "../../server/plaid.sync.fns";
import {
  markTransactionsReviewed,
  setTransactionType,
  updateTransactionCategory,
} from "../../server/transactions.fns";
import { showToast } from "./toast";

type Tx = {
  id: number;
  amount: number;
  date: Date | string;
  datetime: Date | string | null;
  name: string | null;
  merchantName: string;
  location: string | null;
  note: string | null;
  isReviewed: boolean;
  transactionType: "regular" | "income" | "transfer";
  categoryId?: number | null;
  accountId?: number;
  category: { id: number; name: string; icon: string | null } | null;
};

type CategoryGroup = {
  id: number;
  name: string;
  icon: string | null;
  children: {
    id: number;
    name: string;
    icon: string | null;
    budgetAmount: number;
  }[];
};

type ColumnMeta = {
  className?: string;
  headerClassName?: string;
};

const PAGE_SIZE = 100;
type DateRangeFilter = { start: string; end: string } | null;

const GROUP_COLORS = [
  "#f97316",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#22c55e",
  "#0ea5e9",
  "#10b981",
  "#f43f5e",
  "#6366f1",
  "#71717a",
  "#94a3b8",
];

const transactionSearchFilter: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!query) return true;
  const tx = row.original;
  return (
    (tx.name ?? "").toLowerCase().includes(query) ||
    tx.merchantName.toLowerCase().includes(query) ||
    (tx.location ?? "").toLowerCase().includes(query) ||
    (tx.note ?? "").toLowerCase().includes(query) ||
    (tx.category?.name ?? "").toLowerCase().includes(query) ||
    transactionTypeLabel(tx.transactionType).toLowerCase().includes(query)
  );
};

const categoryFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = String(filterValue ?? "all");
  const tx = row.original;
  if (value === "all") return true;
  if (value === "income") return tx.transactionType === "income";
  if (value === "transfer") return tx.transactionType === "transfer";
  if (value === "uncategorized") {
    return tx.transactionType === "regular" && tx.category == null;
  }
  if (!value.startsWith("cat:")) return true;
  return tx.transactionType === "regular" && tx.category?.id === Number(value.slice(4));
};

const reviewStatusFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = String(filterValue ?? "all");
  if (value === "all") return true;
  if (value === "not-reviewed") return !row.original.isReviewed;
  if (value === "reviewed") return row.original.isReviewed;
  return true;
};

const dateFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = filterValue as DateRangeFilter;
  if (!value?.start || !value.end) return true;
  const rowDate = dateInputValue(row.original.date);
  return rowDate >= value.start && rowDate <= value.end;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "AI categorization failed.";
}

function transactionTypeLabel(type: Tx["transactionType"]) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  return "Regular";
}

function transactionTypeBadgeClass(type: Tx["transactionType"]) {
  if (type === "income") return "bg-success-soft text-success";
  if (type === "transfer") return "bg-warning-soft text-warning";
  return "bg-default-100 text-default-600";
}

function dateInputValue(dateVal: Date | string): string {
  const date = new Date(dateVal);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateColumnLabel(dateVal: Date | string): string {
  const date = new Date(dateVal);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateTimeColumnLabel(dateVal: Date | string | null): string {
  if (!dateVal) return "No timestamp";
  const date = new Date(dateVal);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function transactionDisplayName(tx: Tx): string {
  return tx.name?.trim() || tx.merchantName;
}

function formatDateRangeLabel(value: DateRangeFilter) {
  if (!value?.start || !value.end) return "All dates";
  const start = new Date(`${value.start}T00:00:00`);
  const end = new Date(`${value.end}T00:00:00`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function ReviewTable({
  transactions,
  categories,
  showAll = false,
  showReviewButton = false,
  searchQuery = "",
}: {
  transactions: Tx[];
  categories: CategoryGroup[];
  showAll?: boolean;
  showReviewButton?: boolean;
  searchQuery?: string;
}) {
  const router = useRouter();
  const runAICategorizeFn = useServerFn(runAICategorization);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [pickerTxId, setPickerTxId] = useState<number | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [tableSearch, setTableSearch] = useState(searchQuery);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>(null);
  const [fallbackActionIds, setFallbackActionIds] = useState<number[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    reviewStatus: false,
    merchantName: false,
    datetime: false,
    location: false,
  });
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [createTxId, setCreateTxId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("🏷️");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isAICategorizing, startAITransition] = useTransition();

  useEffect(() => {
    setTableSearch(searchQuery);
  }, [searchQuery]);

  const categoryOptions = useMemo(
    () => categories.flatMap((group) => group.children),
    [categories],
  );
  const optionalColumnOptions = [
    { id: "merchantName", label: "Merchant" },
    { id: "datetime", label: "Datetime" },
    { id: "location", label: "Location" },
  ] as const;
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
    ],
    [categoryFilter, dateFilter, showAll],
  );

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setRowSelection({});
    setSelectAllPages(false);
    setFallbackActionIds([]);
  }, [tableSearch, categoryFilter, dateFilter, showAll]);

  const getParentGroupId = (catId: number | null | undefined) => {
    if (!catId) return categories[0]?.id ?? null;
    return (
      categories.find((group) => group.children.some((category) => category.id === catId))?.id ??
      categories[0]?.id ??
      null
    );
  };

  const getCategoryColor = (catId: number | null | undefined) => {
    if (!catId) return "#71717a";
    const idx = categories.findIndex((group) =>
      group.children.some((category) => category.id === catId),
    );
    return GROUP_COLORS[Math.max(0, idx) % GROUP_COLORS.length];
  };

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

  const handleCategoryChange = async (txId: number, categoryId: number | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateTransactionCategory as any)({
      data: { id: txId, categoryId },
    });
    setPickerTxId(null);
    setCatSearch("");
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
    setPickerTxId(null);
    setCatSearch("");
    router.invalidate();
  };

  const openCreateCategoryModal = (tx: Tx) => {
    setCreateTxId(tx.id);
    setNewCategoryName(tx.merchantName);
    setNewCategoryIcon(tx.category?.icon ?? "🏷️");
    setNewCategoryBudget("");
    setNewCategoryParentId(getParentGroupId(tx.category?.id));
    setPickerTxId(null);
    setCatSearch("");
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

  const columns = useMemo<ColumnDef<Tx>[]>(
    () => [
      {
        id: "select",
        header: "",
        enableSorting: false,
        enableGlobalFilter: false,
        meta: {
          className: "w-12 px-4",
          headerClassName: "w-12 px-4",
        },
        cell: ({ row }) => (
          <StyledCheckbox
            checked={row.getIsSelected()}
            onChange={() => {
              setSelectAllPages(false);
              row.toggleSelected(!row.getIsSelected());
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select transaction ${transactionDisplayName(row.original)}`}
          />
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        filterFn: dateFilterFn,
        meta: {
          className: "w-32 px-3",
          headerClassName: "w-32 px-3",
        },
        cell: ({ row }) => (
          <span
            data-testid="transaction-date"
            data-date={dateInputValue(row.original.date)}
            className="block text-xs font-semibold text-default-500"
          >
            {dateColumnLabel(row.original.date)}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          className: "min-w-[13rem] px-3",
          headerClassName: "min-w-[13rem] px-3",
        },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {transactionDisplayName(row.original)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "merchantName",
        header: "Merchant",
        meta: {
          className: "min-w-[11rem] px-3",
          headerClassName: "min-w-[11rem] px-3",
        },
        cell: ({ row }) => (
          <span className="block max-w-[16rem] truncate text-xs font-semibold text-default-500">
            {row.original.merchantName}
          </span>
        ),
      },
      {
        accessorKey: "datetime",
        header: "Datetime",
        meta: {
          className: "w-44 px-3",
          headerClassName: "w-44 px-3",
        },
        cell: ({ row }) => (
          <span className="block text-xs font-semibold text-default-500">
            {dateTimeColumnLabel(row.original.datetime)}
          </span>
        ),
      },
      {
        accessorKey: "location",
        header: "Location",
        meta: {
          className: "min-w-[12rem] px-3",
          headerClassName: "min-w-[12rem] px-3",
        },
        cell: ({ row }) => (
          <span className="block max-w-[18rem] truncate text-xs text-default-400">
            {row.original.location?.trim() || "No location"}
          </span>
        ),
      },
      {
        accessorKey: "note",
        header: "Note",
        meta: {
          className: "hidden min-w-[10rem] px-3 md:table-cell",
          headerClassName: "hidden min-w-[10rem] px-3 md:table-cell",
        },
        cell: ({ row }) => (
          <span className="block max-w-[18rem] truncate text-xs text-default-400">
            {row.original.note?.trim() || "No note"}
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        filterFn: categoryFilterFn,
        meta: {
          className: "w-40 px-3",
          headerClassName: "w-40 px-3",
        },
        cell: ({ row }) => {
          const tx = row.original;
          const color = getCategoryColor(tx.category?.id);

          return (
            <>
              {tx.transactionType === "regular" ? (
                <button
                  className="inline-flex max-w-36 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase transition-opacity hover:opacity-80"
                  style={{ backgroundColor: `${color}22`, color }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPickerTxId(tx.id);
                  }}
                >
                  <span>{tx.category?.icon ?? "❓"}</span>
                  <span className="truncate">{tx.category?.name ?? "Uncategorized"}</span>
                </button>
              ) : (
                <button
                  className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase transition-opacity hover:opacity-80 ${transactionTypeBadgeClass(tx.transactionType)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPickerTxId(tx.id);
                  }}
                >
                  {transactionTypeLabel(tx.transactionType)}
                </button>
              )}

              {pickerTxId === tx.id ? (
                <div
                  className="fixed inset-0 z-[80] flex items-center justify-center bg-black/15 p-4"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPickerTxId(null);
                    setCatSearch("");
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "color-mix(in oklch, var(--background) 96%, white 4%)",
                    }}
                    className="w-full max-w-80 overflow-hidden rounded-2xl border border-divider p-0 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div
                      role="dialog"
                      className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col"
                    >
                      <input
                        autoFocus
                        value={catSearch}
                        onChange={(event) => setCatSearch(event.target.value)}
                        placeholder="Search category"
                        className="w-full shrink-0 border-b border-divider bg-content2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-default-400"
                      />
                      <div className="border-b border-divider px-1.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => handleTransactionTypeChange(tx.id, "income")}
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
                          onClick={() => handleTransactionTypeChange(tx.id, "transfer")}
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
                                onClick={() => handleCategoryChange(tx.id, category.id)}
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
                          onClick={() => openCreateCategoryModal(tx)}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
                        >
                          <PlusIcon size={14} className="shrink-0" />
                          <span>New category</span>
                        </button>
                        <button
                          onClick={() => handleCategoryChange(tx.id, null)}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
                        >
                          <CircleOffIcon size={14} className="shrink-0" />
                          <span>Exclude</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          );
        },
      },
      {
        accessorKey: "amount",
        header: "Amount",
        meta: {
          className: "w-28 px-4 text-right",
          headerClassName: "w-28 px-4 text-right",
        },
        cell: ({ row }) => (
          <span
            className={`text-sm font-bold tabular-nums ${
              row.original.amount < 0 ? "text-danger" : "text-foreground"
            }`}
          >
            {row.original.amount < 0 ? "+" : ""}
            {formatCurrency(Math.abs(row.original.amount))}
          </span>
        ),
      },
      {
        id: "status",
        header: "",
        enableGlobalFilter: false,
        meta: {
          className: "w-10 px-4",
          headerClassName: "w-10 px-4",
        },
        cell: ({ row }) =>
          row.original.isReviewed ? (
            <CheckIcon size={13} className="text-success" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-primary" />
          ),
      },
      {
        id: "reviewStatus",
        accessorFn: (row) => (row.isReviewed ? "reviewed" : "not-reviewed"),
        filterFn: reviewStatusFilterFn,
      },
    ],
    [catSearch, filteredGroups, pickerTxId, router, categories],
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (row) => String(row.id),
    state: {
      columnFilters,
      columnVisibility,
      globalFilter: tableSearch,
      pagination,
      rowSelection,
    },
    enableRowSelection: true,
    globalFilterFn: transactionSearchFilter,
    onGlobalFilterChange: setTableSearch,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const allFilteredIds = filteredRows.map((row) => row.original.id);
  const cappedTransactionIds = allFilteredIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS);
  const selectedIds = table.getFilteredSelectedRowModel().rows.map((row) => row.original.id);
  const allSelected =
    cappedTransactionIds.length > 0 && cappedTransactionIds.every((id) => rowSelection[String(id)]);
  const markIds = selectAllPages
    ? cappedTransactionIds
    : selectedIds.length > 0
      ? selectedIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS)
      : pageRows.map((row) => row.original.id);
  const markIdsKey = markIds.join(",");
  useEffect(() => {
    if (markIds.length > 0) setFallbackActionIds(markIds);
  }, [markIdsKey]);
  const actionIds = markIds.length > 0 ? markIds : fallbackActionIds;
  const aiTransactionCount = Math.min(actionIds.length, AI_CATEGORIZE_MAX_TRANSACTIONS);
  const aiCountLabel =
    actionIds.length > aiTransactionCount
      ? `${aiTransactionCount}/${actionIds.length}`
      : aiTransactionCount;

  const pageCount = table.getPageCount();
  const total = filteredRows.length;
  const start = total === 0 ? 0 : pagination.pageIndex * PAGE_SIZE + 1;
  const end = Math.min((pagination.pageIndex + 1) * PAGE_SIZE, total);
  const toggleAll = () => {
    if (allSelected || selectAllPages) {
      setSelectAllPages(false);
      setRowSelection({});
      return;
    }

    setSelectAllPages(true);
    setRowSelection(Object.fromEntries(cappedTransactionIds.map((id) => [String(id), true])));
  };

  const toggleRow = (row: (typeof pageRows)[number]) => {
    setSelectAllPages(false);
    row.toggleSelected(!row.getIsSelected());
  };

  const handleMarkReviewed = async () => {
    if (!actionIds.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (markTransactionsReviewed as any)({ data: { ids: actionIds } });
    setRowSelection({});
    setSelectAllPages(false);
    setFallbackActionIds([]);
    router.invalidate();
  };

  const handleAICategorize = () => {
    if (!actionIds.length) return;
    const idsToCategorize = actionIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS);
    setFallbackActionIds(idsToCategorize);
    startAITransition(async () => {
      try {
        const payload = {
          ids: idsToCategorize,
          limit: AI_CATEGORIZE_MAX_TRANSACTIONS,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (runAICategorizeFn as any)({ data: payload });
        if (actionIds.length > AI_CATEGORIZE_MAX_TRANSACTIONS) {
          showToast({
            title: `Categorized ${result?.updatedCount ?? aiTransactionCount} transactions`,
            description: "Run AI Categorize again to continue through the remaining transactions.",
          });
        }
      } catch (error) {
        showToast({
          title: "AI categorization failed",
          description: getErrorMessage(error),
          tone: "danger",
        });
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-separator/30 bg-background/70 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <label
              className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-separator bg-background text-foreground transition-colors hover:bg-default"
              title={
                selectAllPages
                  ? total > cappedTransactionIds.length
                    ? `First ${cappedTransactionIds.length} selected`
                    : `All ${total} selected`
                  : selectedIds.length > 0
                    ? `${selectedIds.length} selected`
                    : showAll
                      ? "Select first 100"
                      : "Select all"
              }
            >
              <StyledCheckbox
                checked={selectAllPages || allSelected}
                onChange={toggleAll}
                aria-label={
                  selectAllPages
                    ? "Clear selected transactions"
                    : selectedIds.length > 0
                      ? `${selectedIds.length} transactions selected`
                      : showAll
                        ? "Select first 100 transactions"
                        : "Select all transactions"
                }
              />
            </label>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_16rem_13rem_auto]">
              <SearchField
                aria-label="Search transactions"
                value={tableSearch}
                onChange={setTableSearch}
                fullWidth
                variant="secondary"
                className="min-w-0"
              >
                <SearchField.Group className="h-10 rounded-xl border-separator bg-background shadow-none">
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Select
                aria-label="Filter by category"
                selectedKey={categoryFilter}
                onSelectionChange={(key) => setCategoryFilter(String(key ?? "all"))}
                fullWidth
                variant="secondary"
                className="min-w-0"
              >
                <Select.Trigger className="h-10 rounded-xl border-separator bg-background shadow-none">
                  <Select.Value>{selectedCategoryFilterLabel}</Select.Value>
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <div className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col">
                    <div className="border-b border-divider px-3 py-2">
                      <SearchField
                        aria-label="Search categories"
                        value={categorySearch}
                        onChange={setCategorySearch}
                        variant="secondary"
                        fullWidth
                      >
                        <SearchField.Group className="h-9 rounded-lg border-divider bg-background shadow-none">
                          <SearchField.SearchIcon />
                          <SearchField.Input placeholder="Search categories" />
                          <SearchField.ClearButton />
                        </SearchField.Group>
                      </SearchField>
                    </div>
                    <ListBox
                      items={filteredCategoryFilterOptions}
                      selectedKeys={[categoryFilter]}
                      selectionMode="single"
                      onSelectionChange={(keys) => {
                        const [next] = Array.from(keys);
                        if (next) setCategoryFilter(String(next));
                      }}
                      aria-label="Category filters"
                      className="min-h-0 flex-1"
                    >
                      {(option) => (
                        <ListBox.Item id={option.id} textValue={option.label}>
                          {option.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      )}
                    </ListBox>
                  </div>
                </Select.Popover>
              </Select>
              <DateRangePicker
                aria-label="Filter by date range"
                value={
                  dateFilter
                    ? { start: parseDate(dateFilter.start), end: parseDate(dateFilter.end) }
                    : null
                }
                onChange={(value) =>
                  setDateFilter(
                    value
                      ? {
                          start: value.start.toString(),
                          end: value.end.toString(),
                        }
                      : null,
                  )
                }
                className="min-w-0"
              >
                <div className="relative min-w-0">
                  <DateField.Group
                    fullWidth
                    variant="secondary"
                    className="h-10 rounded-xl border-separator bg-background shadow-none pr-10"
                  >
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateRangePicker.RangeSeparator />
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                  </DateField.Group>
                  {dateFilter ? (
                    <button
                      type="button"
                      aria-label="Clear date filter"
                      onClick={() => setDateFilter(null)}
                      className="absolute right-9 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-default hover:text-foreground"
                    >
                      <XIcon size={13} />
                    </button>
                  ) : null}
                  <DateRangePicker.Trigger className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg hover:bg-default">
                    <DateRangePicker.TriggerIndicator />
                  </DateRangePicker.Trigger>
                </div>
                <DateRangePicker.Popover>
                  <RangeCalendar aria-label="Choose transaction date range">
                    <RangeCalendar.Header>
                      <RangeCalendar.NavButton slot="previous" />
                      <RangeCalendar.Heading />
                      <RangeCalendar.NavButton slot="next" />
                    </RangeCalendar.Header>
                    <RangeCalendar.Grid>
                      <RangeCalendar.GridHeader>
                        {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                      </RangeCalendar.GridHeader>
                      <RangeCalendar.GridBody>
                        {(date) => <RangeCalendar.Cell date={date} />}
                      </RangeCalendar.GridBody>
                    </RangeCalendar.Grid>
                  </RangeCalendar>
                </DateRangePicker.Popover>
              </DateRangePicker>
              <Dropdown>
                <DropdownTrigger className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-separator bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-default">
                  <Columns3Icon size={15} />
                  <span>Columns</span>
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu
                    aria-label="Visible transaction columns"
                    selectionMode="multiple"
                    selectedKeys={optionalColumnOptions
                      .filter((column) => table.getColumn(column.id)?.getIsVisible() ?? false)
                      .map((column) => column.id)}
                    onSelectionChange={(keys) =>
                      setColumnVisibility((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          optionalColumnOptions.map((column) => [
                            column.id,
                            keys === "all" ? true : keys.has(column.id),
                          ]),
                        ),
                        reviewStatus: false,
                      }))
                    }
                  >
                    {optionalColumnOptions.map((column) => (
                      <DropdownItem key={column.id} id={column.id}>
                        <DropdownItemIndicator />
                        <span>{column.label}</span>
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <IconActionButton
              label={`AI Categorize (${aiCountLabel})`}
              tooltip={`AI Categorize (${aiCountLabel})`}
              count={aiCountLabel}
              onClick={handleAICategorize}
              disabled={isAICategorizing || actionIds.length === 0}
              variant="ai"
            >
              {isAICategorizing ? (
                <Loader2Icon size={17} className="animate-spin" />
              ) : (
                <SparklesIcon size={17} />
              )}
            </IconActionButton>
            {showReviewButton ? (
              <IconActionButton
                label={`Mark Reviewed (${actionIds.length})`}
                tooltip={`Mark Reviewed (${actionIds.length})`}
                count={actionIds.length}
                onClick={handleMarkReviewed}
                disabled={actionIds.length === 0}
                variant="review"
              >
                <CheckIcon size={17} />
              </IconActionButton>
            ) : null}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm italic text-default-300">
            {showAll
              ? tableSearch.trim() || categoryFilter !== "all" || dateFilter
                ? "No transactions match your filters"
                : "No transactions yet"
              : "All caught up — no transactions to review"}
          </p>
        </div>
      ) : (
        <>
          <Table className="!overflow-hidden !rounded-none !bg-transparent !p-0">
            <Table.ScrollContainer>
              <Table.Content aria-label="Transactions" className="min-w-[960px] table-fixed">
                <Table.Header className="border-y border-separator/30 bg-background/70">
                  {table
                    .getFlatHeaders()
                    .filter((header) => header.column.getIsVisible())
                    .map((header) => {
                      const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                      return (
                        <Table.Column
                          key={header.id}
                          id={header.id}
                          isRowHeader={header.id === "name"}
                          className={[
                            "rounded-none border-b-0 bg-transparent py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted after:hidden",
                            meta?.headerClassName ?? "px-3",
                          ].join(" ")}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </Table.Column>
                      );
                    })}
                </Table.Header>
                <Table.Body>
                  {pageRows.map((row) => (
                    <Table.Row
                      key={row.id}
                      id={row.id}
                      data-testid={`transaction-row-${row.original.id}`}
                      onPress={() => toggleRow(row)}
                      className="cursor-pointer transition-colors hover:bg-default/45"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                        return (
                          <Table.Cell
                            key={cell.id}
                            className={[
                              "border-b border-separator/20 py-3 align-middle",
                              meta?.className ?? "px-3",
                            ].join(" ")}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Table.Cell>
                        );
                      })}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>

          <Table.Footer className="flex items-center justify-between border-t border-separator/30 px-4 py-3 sm:px-6">
            <span className="text-xs font-medium text-default-400">
              {start} – {end} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeftIcon size={15} />
              </button>
              <span className="px-2 text-xs font-semibold text-default-400">
                {pagination.pageIndex + 1} / {Math.max(1, pageCount)}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRightIcon size={15} />
              </button>
            </div>
          </Table.Footer>
        </>
      )}

      <Modal
        isOpen={isCreateCategoryOpen}
        onOpenChange={(open) => {
          if (!open && !isCreatingCategory) setIsCreateCategoryOpen(false);
        }}
      >
        <ModalBackdrop variant="opaque" className="bg-black/55">
          <ModalContainer placement="center">
            <ModalDialog className="max-w-xl overflow-hidden rounded-3xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
              <ModalHeader className="flex items-center justify-between border-b border-divider px-7 py-6">
                <ModalHeading className="text-4 font-bold text-foreground">
                  New category
                </ModalHeading>
                <button
                  onClick={() => {
                    if (isCreatingCategory) return;
                    setIsCreateCategoryOpen(false);
                  }}
                  className="h-8 w-8 rounded-full text-default-400 transition-colors hover:bg-content2"
                >
                  x
                </button>
              </ModalHeader>

              <ModalBody className="flex flex-col gap-5 px-7 py-6">
                <div className="flex items-center gap-4">
                  <input
                    value={newCategoryIcon}
                    onChange={(event) => setNewCategoryIcon(event.target.value)}
                    maxLength={4}
                    className="h-16 w-16 rounded-3xl border border-divider bg-content2 text-center text-2xl outline-none"
                  />
                  <Input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Category name"
                    className="text-2xl font-semibold"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-2 font-semibold text-default-500">Group</label>
                  <select
                    value={newCategoryParentId ?? ""}
                    onChange={(event) =>
                      setNewCategoryParentId(event.target.value ? Number(event.target.value) : null)
                    }
                    className="h-14 rounded-2xl border border-divider bg-content2 px-4 text-foreground outline-none"
                  >
                    {categories.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.icon} {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-2 font-semibold text-default-500">Budget</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={newCategoryBudget}
                    onChange={(event) => setNewCategoryBudget(event.target.value)}
                    placeholder="0"
                  />
                </div>
              </ModalBody>

              <ModalFooter className="flex items-center justify-end gap-3 border-t border-divider bg-content1 px-7 py-5">
                <Button
                  onPress={() => setIsCreateCategoryOpen(false)}
                  isDisabled={isCreatingCategory}
                  className="rounded-xl bg-default-100 text-foreground hover:bg-default-200"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={handleCreateCategory}
                  isDisabled={
                    isCreatingCategory || !newCategoryName.trim() || newCategoryParentId === null
                  }
                  className="rounded-xl"
                >
                  {isCreatingCategory ? "Creating..." : "Create"}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}

function StyledCheckbox({
  checked,
  onChange,
  onClick,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-400 bg-content2 accent-primary"
    />
  );
}

function IconActionButton({
  children,
  count,
  disabled,
  label,
  onClick,
  tooltip,
  variant,
}: {
  children: ReactNode;
  count: number | string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tooltip: string;
  variant: "ai" | "review";
}) {
  const variantClass =
    variant === "ai"
      ? "bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35"
      : "bg-foreground text-background shadow-sm hover:opacity-90";
  const badgeClass =
    variant === "ai"
      ? "border-white/30 bg-white/95 text-blue-700"
      : "border-background/20 bg-background text-foreground";

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={tooltip}
        onClick={onClick}
        disabled={disabled}
        className={[
          "relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none",
          variantClass,
        ].join(" ")}
      >
        {children}
        <span
          className={[
            "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-black leading-none tabular-nums",
            badgeClass,
          ].join(" ")}
        >
          {count}
        </span>
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-divider bg-foreground px-2.5 py-1.5 text-[11px] font-bold text-background opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {tooltip}
      </span>
    </span>
  );
}
