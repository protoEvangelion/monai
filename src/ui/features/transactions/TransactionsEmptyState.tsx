import type { AmountRangeFilter, DateRangeFilter } from "./transactions.types";

export function TransactionsEmptyState({
  amountFilter,
  categoryFilter,
  dateFilter,
  searchInput,
  showAll,
}: {
  amountFilter: AmountRangeFilter;
  categoryFilter: string;
  dateFilter: DateRangeFilter;
  searchInput: string;
  showAll: boolean;
}) {
  const hasFilters = searchInput.trim() || categoryFilter !== "all" || dateFilter || amountFilter;
  const message = showAll
    ? hasFilters
      ? "No transactions match your filters"
      : "No transactions yet"
    : "All caught up — no transactions to review";

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm italic text-default-300">{message}</p>
    </div>
  );
}
