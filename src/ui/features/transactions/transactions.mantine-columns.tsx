import { Checkbox, Select, Text, Tooltip } from "@mantine/core";
import type { MRT_ColumnDef } from "mantine-react-table";
import { CheckIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { TransactionCategoryCell } from "./TransactionCategoryCell";
import { TransactionNoteCell } from "./TransactionNoteCell";
import type { CategoryGroup, Tx } from "./transactions.types";
import {
  GROUP_COLORS,
  categoryFilterFn,
  dateColumnLabel,
  dateInputValue,
  dateTimeColumnLabel,
  encodeCategoryFilter,
  mrtAmountRangeFilterFn,
  mrtDateRangeFilterFn,
  parseCategoryFilter,
  reviewStatusFilterFn,
  transactionDisplayName,
} from "./transactions.utils";

export type TransactionTableVariant = "full" | "dashboard" | "category";

type CreateMrtTransactionColumnsArgs = {
  categories: CategoryGroup[];
  catSearch: string;
  filteredGroups: CategoryGroup[];
  maxAmount: number;
  onCategoryChange: (txId: number, categoryId: number | null) => void;
  onCategorySearchChange: (value: string) => void;
  onCreateCategory: (tx: Tx) => void;
  onPickerTxIdChange: (txId: number | null) => void;
  onTransactionTypeChange: (txId: number, transactionType: "income" | "transfer") => void;
  pickerTxId: number | null;
  lockedCategoryFilter?: string;
  lockedDateRange?: [string, string];
  variant: TransactionTableVariant;
};

function getCategoryColor(categories: CategoryGroup[], catId: number | null | undefined) {
  if (!catId) return "#71717a";
  const idx = categories.findIndex((group) =>
    group.children.some((category) => category.id === catId),
  );
  return GROUP_COLORS[Math.max(0, idx) % GROUP_COLORS.length];
}

function categoryFilterOptions(categories: CategoryGroup[]) {
  return [
    { value: "all", label: "All categories" },
    { value: "uncategorized", label: "Uncategorized" },
    { value: "income", label: "Income" },
    { value: "transfer", label: "Transfer" },
    ...categories.flatMap((group) =>
      group.children.map((child) => ({
        value: `cat:${child.id}`,
        label: `${child.icon ?? ""} ${child.name}`.trim(),
      })),
    ),
  ];
}

export function createMrtTransactionColumns({
  categories,
  catSearch,
  filteredGroups,
  maxAmount,
  onCategoryChange,
  onCategorySearchChange,
  onCreateCategory,
  onPickerTxIdChange,
  onTransactionTypeChange,
  pickerTxId,
  lockedCategoryFilter,
  lockedDateRange,
  variant,
}: CreateMrtTransactionColumnsArgs): MRT_ColumnDef<Tx>[] {
  const isMinimal = variant === "category";
  const categoryOptions = categoryFilterOptions(categories);

  const dateColumn: MRT_ColumnDef<Tx> = {
    id: "date",
    accessorKey: "date",
    header: "Date",
    size: isMinimal ? 100 : 120,
    filterVariant: "date-range",
    enableColumnFilter: !lockedDateRange,
    filterFn: mrtDateRangeFilterFn,
    sortingFn: "datetime",
    accessorFn: (row) => new Date(row.date).getTime(),
    Cell: ({ row }) => (
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        data-testid="transaction-date"
        data-date={dateInputValue(row.original.date)}
      >
        {dateColumnLabel(row.original.date)}
      </Text>
    ),
  };

  const nameColumn: MRT_ColumnDef<Tx> = {
    id: "name",
    accessorFn: (row) => transactionDisplayName(row),
    header: "Name",
    size: isMinimal ? 160 : 220,
    filterVariant: "text",
    Cell: ({ row }) => {
      const name = transactionDisplayName(row.original);
      return (
        <Tooltip label={name} multiline maw={320} openDelay={300} withArrow>
          <Text size="sm" fw={600} truncate style={{ cursor: "default" }}>
            {name}
          </Text>
        </Tooltip>
      );
    },
  };

  const amountColumn: MRT_ColumnDef<Tx> = {
    accessorKey: "amount",
    header: "Amount",
    size: isMinimal ? 100 : 120,
    filterVariant: "range-slider",
    mantineFilterRangeSliderProps: {
      min: 0,
      max: Math.max(100, Math.ceil(maxAmount)),
      step: 1,
    },
    filterFn: mrtAmountRangeFilterFn,
    Cell: ({ row }) => (
      <Text
        size="sm"
        fw={700}
        ta="right"
        c={row.original.amount < 0 ? "teal" : undefined}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {row.original.amount < 0 ? "+" : ""}
        {formatCurrency(Math.abs(row.original.amount))}
      </Text>
    ),
  };

  const categoryColumn: MRT_ColumnDef<Tx> = {
    id: "category",
    accessorFn: (row) => row.category?.name ?? "",
    header: "Category",
    size: 160,
    enableSorting: false,
    enableColumnFilter: !lockedCategoryFilter,
    filterFn: categoryFilterFn,
    Filter: ({ column }) => {
      const value = String(column.getFilterValue() ?? "all");
      const { isExclude: exclude, key } = parseCategoryFilter(value);
      return (
        <div className="flex items-center gap-1.5">
          <Select
            comboboxProps={{ withinPortal: false }}
            data={categoryOptions}
            searchable
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            value={key}
            onChange={(next) =>
              column.setFilterValue(encodeCategoryFilter(next ?? "all", exclude && next !== "all"))
            }
          />
          <Checkbox
            aria-label="Exclude category"
            checked={exclude}
            disabled={key === "all"}
            size="xs"
            title="Exclude category"
            onChange={(event) =>
              column.setFilterValue(encodeCategoryFilter(key, event.currentTarget.checked))
            }
          />
        </div>
      );
    },
    Cell: ({ row }) => (
      <TransactionCategoryCell
        catSearch={catSearch}
        color={getCategoryColor(categories, row.original.category?.id)}
        filteredGroups={filteredGroups}
        onCategoryChange={onCategoryChange}
        onCategorySearchChange={onCategorySearchChange}
        onCreateCategory={onCreateCategory}
        onPickerTxIdChange={onPickerTxIdChange}
        onTransactionTypeChange={onTransactionTypeChange}
        pickerTxId={pickerTxId}
        tx={row.original}
      />
    ),
  };

  if (isMinimal) {
    return lockedCategoryFilter
      ? [dateColumn, nameColumn, amountColumn]
      : [dateColumn, nameColumn, amountColumn, categoryColumn];
  }

  const columns: MRT_ColumnDef<Tx>[] = [
    dateColumn,
    nameColumn,
    categoryColumn,
    amountColumn,
  ];

  columns.splice(2, 0, {
    id: "note",
    accessorKey: "note",
    header: "Note",
    size: 220,
    filterVariant: "text",
    Cell: ({ row }) => <TransactionNoteCell tx={row.original} />,
  });
  columns.push(
    {
      accessorKey: "merchantName",
      header: "Merchant",
      size: 180,
      filterVariant: "text",
      Cell: ({ row }) => (
        <Text size="xs" fw={600} c="dimmed" truncate>
          {row.original.merchantName}
        </Text>
      ),
    },
    {
      id: "datetime",
      accessorKey: "datetime",
      header: "Datetime",
      size: 160,
      filterVariant: "text",
      accessorFn: (row) => dateTimeColumnLabel(row.datetime),
      Cell: ({ row }) => (
        <Text size="xs" c="dimmed">
          {dateTimeColumnLabel(row.original.datetime)}
        </Text>
      ),
    },
    {
      accessorKey: "location",
      header: "Location",
      size: 180,
      filterVariant: "text",
      Cell: ({ row }) => (
        <Text size="xs" c="dimmed" truncate>
          {row.original.location?.trim() || "No location"}
        </Text>
      ),
    },
    {
      id: "reviewStatus",
      accessorFn: (row) => (row.isReviewed ? "reviewed" : "not-reviewed"),
      header: "Review",
      size: 96,
      minSize: 80,
      enableSorting: false,
      enableResizing: false,
      filterFn: reviewStatusFilterFn,
      Filter: ({ column }) => (
        <Select
          comboboxProps={{ withinPortal: false }}
          data={[
            { value: "all", label: "All" },
            { value: "not-reviewed", label: "Needs review" },
            { value: "reviewed", label: "Reviewed" },
          ]}
          size="xs"
          value={String(column.getFilterValue() ?? "all")}
          onChange={(value) => column.setFilterValue(value ?? "all")}
        />
      ),
      Cell: ({ row }) =>
        row.original.isReviewed ? (
          <CheckIcon size={13} className="text-success" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-primary" />
        ),
    },
  );

  return columns;
}

export function monthDateRangeFilter(viewDate: string) {
  const month = new Date(viewDate);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
