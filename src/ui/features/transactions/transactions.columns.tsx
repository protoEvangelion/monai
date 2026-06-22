import type { ColumnDef } from "@tanstack/react-table";
import { CheckIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { StyledCheckbox } from "./transactions.controls";
import { TransactionCategoryCell } from "./TransactionCategoryCell";
import type { CategoryGroup, Tx } from "./transactions.types";
import {
  GROUP_COLORS,
  amountFilterFn,
  categoryFilterFn,
  dateColumnLabel,
  dateFilterFn,
  dateInputValue,
  dateTimeColumnLabel,
  reviewStatusFilterFn,
  transactionDisplayName,
} from "./transactions.utils";

type TransactionColumnsArgs = {
  categories: CategoryGroup[];
  catSearch: string;
  filteredGroups: CategoryGroup[];
  onCategoryChange: (txId: number, categoryId: number | null) => void;
  onCategorySearchChange: (value: string) => void;
  onCreateCategory: (tx: Tx) => void;
  onPickerTxIdChange: (txId: number | null) => void;
  onRowSelectStart: () => void;
  onRowSelectionChange: (txId: number, checked: boolean) => void;
  onTransactionTypeChange: (txId: number, transactionType: "income" | "transfer") => void;
  isRowSelected: (txId: number) => boolean;
  pickerTxId: number | null;
};

function getCategoryColor(categories: CategoryGroup[], catId: number | null | undefined) {
  if (!catId) return "#71717a";
  const idx = categories.findIndex((group) =>
    group.children.some((category) => category.id === catId),
  );
  return GROUP_COLORS[Math.max(0, idx) % GROUP_COLORS.length];
}

export function createTransactionColumns({
  categories,
  catSearch,
  filteredGroups,
  onCategoryChange,
  onCategorySearchChange,
  onCreateCategory,
  onPickerTxIdChange,
  onRowSelectStart,
  onRowSelectionChange,
  onTransactionTypeChange,
  isRowSelected,
  pickerTxId,
}: TransactionColumnsArgs): ColumnDef<Tx>[] {
  return [
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
        <span
          className="inline-flex"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <StyledCheckbox
            checked={isRowSelected(row.original.id)}
            deferChange
            onChange={(checked) => {
              onRowSelectStart();
              onRowSelectionChange(row.original.id, checked);
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Select transaction ${transactionDisplayName(row.original)}`}
          />
        </span>
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
        return (
          <TransactionCategoryCell
            catSearch={catSearch}
            color={getCategoryColor(categories, tx.category?.id)}
            filteredGroups={filteredGroups}
            onCategoryChange={onCategoryChange}
            onCategorySearchChange={onCategorySearchChange}
            onCreateCategory={onCreateCategory}
            onPickerTxIdChange={onPickerTxIdChange}
            onTransactionTypeChange={onTransactionTypeChange}
            pickerTxId={pickerTxId}
            tx={tx}
          />
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      filterFn: amountFilterFn,
      meta: {
        className: "w-28 px-4 text-right",
        headerClassName: "w-28 px-4 text-right",
      },
      cell: ({ row }) => (
        <span
          className={`text-sm font-bold tabular-nums ${
            row.original.amount < 0 ? "text-success" : "text-foreground"
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
  ];
}
