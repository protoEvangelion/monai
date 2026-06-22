import { getCategoriesWithSpending } from "../../../server/categories.fns";
import { getTransactionsPage, type TransactionsPageQuery } from "../../../server/transactions.fns";
import { ReviewTable } from "../../shared/ReviewTable";
import type { AmountRangeFilter, DateRangeFilter } from "./transactions.types";

type TransactionsPageData = Awaited<ReturnType<typeof getTransactionsPage>>;
type CategoriesData = Awaited<ReturnType<typeof getCategoriesWithSpending>>;

function dateFilterFromQuery(query: TransactionsPageQuery): DateRangeFilter {
  return query.dateStart && query.dateEnd
    ? { start: query.dateStart, end: query.dateEnd }
    : null;
}

function amountFilterFromQuery(query: TransactionsPageQuery): AmountRangeFilter {
  return query.amountMin || query.amountMax
    ? { min: query.amountMin ?? "", max: query.amountMax ?? "" }
    : null;
}

export function TransactionsScreen({
  categories,
  onQueryChange,
  query,
  transactionsPage,
}: {
  categories: CategoriesData;
  onQueryChange: (query: Partial<TransactionsPageQuery>) => void;
  query: TransactionsPageQuery;
  transactionsPage: TransactionsPageData;
}) {
  return (
    <div className="rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <div className="flex h-14 items-center border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
        <h1 className="text-lg font-bold">Transactions</h1>
      </div>

      <ReviewTable
        transactions={transactionsPage.rows}
        categories={categories}
        showAll
        serverState={{
          amountFilter: amountFilterFromQuery(query),
          categoryFilter: query.categoryFilter ?? "all",
          dateFilter: dateFilterFromQuery(query),
          onQueryChange,
          pageIndex: transactionsPage.pageIndex,
          pageSize: transactionsPage.pageSize,
          search: query.search ?? "",
          total: transactionsPage.total,
        }}
      />
    </div>
  );
}
