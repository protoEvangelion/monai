import {
  type Row,
  type Table as TanStackTable,
  flexRender,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { memo } from "react";
import type { ColumnMeta, Tx } from "./transactions.types";

type TransactionsDataGridProps = {
  columnRenderKey: unknown;
  pageRows: Row<Tx>[];
  pagination: {
    pageIndex: number;
    pageSize: number;
  };
  rowSelection: Record<string, boolean>;
  table: TanStackTable<Tx>;
  total: number;
};

export function TransactionsDataGrid({
  columnRenderKey,
  pageRows,
  pagination,
  rowSelection,
  table,
  total,
}: TransactionsDataGridProps) {
  const pageCount = table.getPageCount();
  const start = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = Math.min((pagination.pageIndex + 1) * pagination.pageSize, total);

  return (
    <>
      <div className="overflow-hidden border-y border-separator/30">
        <div className="overflow-x-auto">
          <table aria-label="Transactions" className="w-full min-w-[960px] table-fixed border-collapse">
            <thead className="bg-background/70">
              <tr>
                {table
                  .getFlatHeaders()
                  .filter((header) => header.column.getIsVisible())
                  .map((header) => {
                    const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={[
                          "border-b border-separator/30 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted",
                          meta?.headerClassName ?? "px-3",
                        ].join(" ")}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <TransactionDataRow
                  columnRenderKey={columnRenderKey}
                  key={row.id}
                  row={row}
                  selected={Boolean(rowSelection[row.id])}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-separator/30 px-4 py-3 sm:px-6">
        <span className="text-xs font-medium text-default-400">
          {start} - {end} of {total}
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
      </div>
    </>
  );
}

const TransactionDataRow = memo(
  function TransactionDataRow({
    row,
  }: {
    columnRenderKey: unknown;
    row: Row<Tx>;
    selected: boolean;
  }) {
    return (
      <tr
        id={row.id}
        data-testid={`transaction-row-${row.original.id}`}
        className="transition-colors hover:bg-default/35"
      >
        {row.getVisibleCells().map((cell) => {
          const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
          return (
            <td
              key={cell.id}
              className={[
                "border-b border-separator/20 py-3 align-middle",
                meta?.className ?? "px-3",
              ].join(" ")}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.row.original === next.row.original &&
    prev.selected === next.selected &&
    prev.columnRenderKey === next.columnRenderKey,
);
