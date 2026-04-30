import { Card, CardContent } from "@heroui/react";
import { ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { formatCurrency } from "../../../lib/format";
import { BudgetProgress } from "./BudgetProgress";

export type CategoryTableRow = {
  id: string;
  kind: "group" | "child";
  groupId: number;
  childId: number | null;
  name: string;
  icon: string | null;
  spent: number;
  budget: number;
  txCount: number;
  childCount: number;
  activeChildren: number;
};

export function CategoryTable({
  rows,
  selectedRowId,
  expandedGroupIds,
  onRowClick,
  onToggleExpand,
}: {
  rows: CategoryTableRow[];
  selectedRowId: string | null;
  expandedGroupIds: Set<number>;
  onRowClick: (item: CategoryTableRow) => void;
  onToggleExpand: (item: CategoryTableRow) => void;
}) {
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const columnHelper = createColumnHelper<CategoryTableRow>();

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "category",
        header: () => "Regular categories",
        cell: ({ row }) => {
          const item = row.original;
          const isGroup = item.kind === "group";
          const isActive = selectedRowId === item.id;

          if (isGroup) {
            const expanded = expandedGroupIds.has(item.groupId);
            return (
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={expanded ? "Collapse group" : "Expand group"}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-default-400 hover:bg-default-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpand(item);
                  }}
                >
                  <ChevronRightIcon
                    size={14}
                    className={
                      expanded
                        ? "rotate-90 transition-transform"
                        : "transition-transform"
                    }
                  />
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    className={`block w-full cursor-pointer truncate text-left text-base font-semibold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRowClick(item);
                    }}
                  >
                    {item.name}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="min-w-0 pl-12">
              <button
                type="button"
                className={`block w-full cursor-pointer truncate text-left text-sm font-semibold ${isActive ? "text-primary" : "text-foreground"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick(item);
                }}
              >
                {item.icon} {item.name}
              </button>
            </div>
          );
        },
      }),
      columnHelper.accessor("spent", {
        header: () => <span className="block text-right">Spent</span>,
        cell: ({ row, getValue }) => (
          <span
            className={`block text-right ${row.original.kind === "group" ? "text-base font-semibold text-foreground" : "text-sm font-semibold text-default-700"}`}
          >
            {formatCurrency(getValue(), { maximumFractionDigits: 0 })}
          </span>
        ),
      }),
      columnHelper.display({
        id: "progress",
        header: () => <span aria-hidden="true" />,
        cell: ({ row }) => (
          <BudgetProgress
            spent={row.original.spent}
            budget={row.original.budget}
          />
        ),
      }),
      columnHelper.accessor("budget", {
        header: () => <span className="block text-left">Budgeted</span>,
        cell: ({ row, getValue }) => (
          <span
            className={`block text-left ${row.original.kind === "group" ? "text-base font-semibold text-foreground" : "text-sm font-semibold text-foreground"}`}
          >
            {formatCurrency(getValue(), { maximumFractionDigits: 0 })}
          </span>
        ),
      }),
    ],
    [columnHelper, expandedGroupIds, onRowClick, onToggleExpand, selectedRowId],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="w-full min-w-0 overflow-hidden border border-divider/60 bg-content1 shadow-none">
      <CardContent className="p-0">
        <div className="overflow-hidden">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-default-400 ${
                        header.id === "category"
                          ? "w-[36%] text-left"
                          : header.id === "progress"
                            ? "w-[36%] text-center"
                            : "w-[14%] text-left"
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const item = row.original;
                const selected = selectedRowId === item.id;
                const hovered = hoveredRowId === item.id;
                const rowSurfaceClass = selected
                  ? "bg-[color-mix(in_oklch,var(--color-accent)_12%,transparent)]"
                  : hovered
                    ? "bg-[color-mix(in_oklch,var(--color-accent)_16%,transparent)]"
                    : "";
                const cells = row.getVisibleCells();
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredRowId(item.id)}
                    onMouseLeave={() =>
                      setHoveredRowId((prev) =>
                        prev === item.id ? null : prev,
                      )
                    }
                    onClick={() => onRowClick(item)}
                  >
                    {cells.map((cell, ci) => (
                      <td
                        key={cell.id}
                        className={[
                          "px-3 py-2.5 align-middle transition-[background-color,border-color,color] duration-150",
                          rowSurfaceClass,
                          cell.column.id === "progress"
                            ? "text-center"
                            : cell.column.id === "category"
                              ? "text-left"
                              : "text-left",
                          ci === 0 ? "rounded-l-xl" : "",
                          ci === cells.length - 1 ? "rounded-r-xl" : "",
                        ].join(" ")}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
