import { useMemo } from "react";
import { getCategories } from "../../../server/categories.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { ReviewTable } from "../transactions/TransactionsTable";
import type { CategoryGroup, Tx } from "../transactions/transactions.types";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];

export function CategoryTransactionsPanel({
  categories,
  transactions,
  selectedGroups,
  viewDate,
  lockedCategoryFilter,
  onRefresh,
}: {
  categories: CategoryGroup[];
  transactions: LoadedTransaction[];
  selectedGroups: LoadedGroup[];
  viewDate: string;
  lockedCategoryFilter?: string;
  onRefresh: () => void;
}) {
  const txs = useMemo(() => transactions as Tx[], [transactions]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col border-t border-divider/30">
      <ReviewTable
        categories={categories}
        categoryBulkGroups={selectedGroups}
        lockedCategoryFilter={lockedCategoryFilter}
        onCategoryRefresh={onRefresh}
        showAll
        transactions={txs}
        variant="category"
        viewDate={viewDate}
      />
    </div>
  );
}
