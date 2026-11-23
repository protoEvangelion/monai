import { lazy, Suspense, type ComponentProps } from "react";
import type { ReviewTable as ReviewTableImpl } from "../features/transactions/TransactionsTable";

/**
 * The review table is the single heaviest client chunk (Mantine + Mantine React
 * Table + the column definitions, ~550 kB raw). It is not needed for first
 * paint on the dashboard, so it loads on demand and the dashboard's initial
 * payload stays free of the Mantine table stack.
 */
const LazyReviewTable = lazy(() =>
  import("../features/transactions/TransactionsTable").then((module) => ({
    default: module.ReviewTable,
  })),
);

type ReviewTableProps = ComponentProps<typeof ReviewTableImpl>;

export function ReviewTable(props: ReviewTableProps) {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full min-h-40 items-center justify-center text-sm text-default-400"
          role="status"
        >
          Loading transactions…
        </div>
      }
    >
      <LazyReviewTable {...props} />
    </Suspense>
  );
}

export type { CategoryGroup, Tx } from "../features/transactions/transactions.types";
