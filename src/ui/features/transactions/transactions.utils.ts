import type { FilterFn } from "@tanstack/react-table";
import { formatCurrency } from "../../../lib/format";
import type { AmountRangeFilter, DateRangeFilter, Tx } from "./transactions.types";

export const PAGE_SIZE = 100;

export const GROUP_COLORS = [
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

export const transactionSearchFilter: FilterFn<Tx> = (row, _columnId, filterValue) => {
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

export function parseCategoryFilter(value: string) {
  const isExclude = value.startsWith("not:");
  const key = isExclude ? value.slice(4) : value;
  return { isExclude, key };
}

export function encodeCategoryFilter(key: string, exclude: boolean) {
  if (key === "all" || !exclude) return key;
  return `not:${key}`;
}

function txMatchesCategoryFilterKey(tx: Tx, key: string) {
  if (key === "all") return true;
  if (key === "income") return tx.transactionType === "income";
  if (key === "transfer") return tx.transactionType === "transfer";
  if (key === "uncategorized") {
    return tx.transactionType === "regular" && tx.category == null;
  }
  if (key.startsWith("cat:")) {
    return tx.transactionType === "regular" && tx.category?.id === Number(key.slice(4));
  }
  return true;
}

export const categoryFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const { isExclude, key } = parseCategoryFilter(String(filterValue ?? "all"));
  const matches = txMatchesCategoryFilterKey(row.original, key);
  return isExclude ? !matches : matches;
};

export const reviewStatusFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = String(filterValue ?? "all");
  if (value === "all") return true;
  if (value === "not-reviewed") return !row.original.isReviewed;
  if (value === "reviewed") return row.original.isReviewed;
  return true;
};

export const dateFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = filterValue as DateRangeFilter;
  if (!value?.start || !value.end) return true;
  const rowDate = dateInputValue(row.original.date);
  return rowDate >= value.start && rowDate <= value.end;
};

export const amountFilterFn: FilterFn<Tx> = (row, _columnId, filterValue) => {
  const value = filterValue as AmountRangeFilter;
  if (!value?.min && !value?.max) return true;
  const amount = Math.abs(row.original.amount);
  const min = value.min.trim() ? Number(value.min) : null;
  const max = value.max.trim() ? Number(value.max) : null;
  if (min !== null && Number.isFinite(min) && amount < min) return false;
  if (max !== null && Number.isFinite(max) && amount > max) return false;
  return true;
};

export const mrtDateRangeFilterFn: FilterFn<Tx> = (row, _columnId, filterValue, _addMeta) => {
  if (!filterValue) return true;
  const rowDate = dateInputValue(row.original.date);
  if (Array.isArray(filterValue)) {
    const [start, end] = filterValue;
    const startStr =
      start instanceof Date
        ? start.toISOString().slice(0, 10)
        : typeof start === "string"
          ? start
          : "";
    const endStr =
      end instanceof Date ? end.toISOString().slice(0, 10) : typeof end === "string" ? end : "";
    if (startStr && rowDate < startStr) return false;
    if (endStr && rowDate > endStr) return false;
    return true;
  }
  return dateFilterFn(row, _columnId, filterValue, () => undefined);
};

export const mrtAmountRangeFilterFn: FilterFn<Tx> = (row, _columnId, filterValue, addMeta) => {
  if (!filterValue) return true;
  if (Array.isArray(filterValue)) {
    const [min, max] = filterValue as [number, number];
    const amount = Math.abs(row.original.amount);
    if (Number.isFinite(min) && min > 0 && amount < min) return false;
    if (Number.isFinite(max) && max > 0 && amount > max) return false;
    return true;
  }
  return amountFilterFn(row, _columnId, filterValue, addMeta);
};

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "AI categorization failed.";
}

export function transactionTypeLabel(type: Tx["transactionType"]) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  return "Regular";
}

export function transactionTypeBadgeClass(type: Tx["transactionType"]) {
  if (type === "income") return "bg-success-soft text-success";
  if (type === "transfer") return "bg-warning-soft text-warning";
  return "bg-default-100 text-default-600";
}

export function dateInputValue(dateVal: Date | string): string {
  const date = new Date(dateVal);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateColumnLabel(dateVal: Date | string): string {
  const date = new Date(dateVal);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function dateTimeColumnLabel(dateVal: Date | string | null): string {
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

export function transactionDisplayName(tx: Tx): string {
  return tx.name?.trim() || tx.merchantName;
}

export function formatDateRangeLabel(value: DateRangeFilter) {
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

export function formatAmountRangeLabel(value: AmountRangeFilter) {
  if (!value?.min && !value?.max) return "Any amount";
  const formatAmount = (raw: string) => formatCurrency(Number(raw) || 0);
  if (value.min && value.max) return `${formatAmount(value.min)} - ${formatAmount(value.max)}`;
  if (value.min) return `>= ${formatAmount(value.min)}`;
  return `<= ${formatAmount(value.max)}`;
}

export const LOCAL_COLUMN_FILTER_IDS = [
  "note",
  "merchantName",
  "location",
  "datetime",
] as const;

function includesFilter(value: string, query: string) {
  return value.toLowerCase().includes(query);
}

export function applyLocalColumnFilters(rows: Tx[], filters: { id: string; value: unknown }[]) {
  let result = rows;
  for (const filter of filters) {
    const query = String(filter.value ?? "")
      .trim()
      .toLowerCase();
    if (!query || query === "all") continue;

    switch (filter.id) {
      case "note":
        result = result.filter((tx) => includesFilter(tx.note ?? "", query));
        break;
      case "merchantName":
        result = result.filter((tx) => includesFilter(tx.merchantName, query));
        break;
      case "location":
        result = result.filter((tx) => includesFilter(tx.location ?? "", query));
        break;
      case "datetime":
        result = result.filter((tx) => includesFilter(dateTimeColumnLabel(tx.datetime), query));
        break;
      case "reviewStatus":
        result = result.filter((tx) => {
          if (query === "not-reviewed") return !tx.isReviewed;
          if (query === "reviewed") return tx.isReviewed;
          return true;
        });
        break;
    }
  }
  return result;
}
