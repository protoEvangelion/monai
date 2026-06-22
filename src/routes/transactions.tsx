import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getTransactionsPage, type TransactionsPageQuery } from "../server/transactions.fns";
import { getCategoriesWithSpending } from "../server/categories.fns";
import { TransactionsScreen } from "../ui/features/transactions/transactions.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

type TransactionsSearch = TransactionsPageQuery;

function textSearchParam(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberSearchParam(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function reviewStatusParam(value: unknown) {
  return value === "not-reviewed" || value === "reviewed" ? value : undefined;
}

function cleanTransactionsSearch(search: TransactionsSearch): TransactionsSearch {
  return {
    amountMax: search.amountMax || undefined,
    amountMin: search.amountMin || undefined,
    categoryFilter: search.categoryFilter === "all" ? undefined : search.categoryFilter,
    dateEnd: search.dateEnd || undefined,
    dateStart: search.dateStart || undefined,
    pageIndex: search.pageIndex ? search.pageIndex : undefined,
    pageSize: search.pageSize && search.pageSize !== 100 ? search.pageSize : undefined,
    reviewStatus: search.reviewStatus === "all" ? undefined : search.reviewStatus,
    search: search.search || undefined,
  };
}

export const Route = createFileRoute("/transactions")({
  component: TransactionsRoute,
  beforeLoad: async () => await authStateFn(),
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    amountMax: textSearchParam(search.amountMax),
    amountMin: textSearchParam(search.amountMin),
    categoryFilter: textSearchParam(search.categoryFilter) || undefined,
    dateEnd: textSearchParam(search.dateEnd),
    dateStart: textSearchParam(search.dateStart),
    pageIndex: numberSearchParam(search.pageIndex),
    pageSize: numberSearchParam(search.pageSize),
    reviewStatus: reviewStatusParam(search.reviewStatus),
    search: textSearchParam(search.search),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [transactionsPage, categories] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getTransactionsPage as any)({ data: deps }),
      getCategoriesWithSpending(),
    ]);
    return { transactionsPage, categories };
  },
});

function TransactionsRoute() {
  const { transactionsPage, categories } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <TransactionsScreen
      transactionsPage={transactionsPage}
      categories={categories}
      query={search}
      onQueryChange={(next) =>
        navigate({
          search: (prev) => cleanTransactionsSearch({ ...prev, ...next }),
        })
      }
    />
  );
}
