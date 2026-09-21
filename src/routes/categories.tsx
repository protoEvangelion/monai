import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getCategories } from "../server/categories.fns";
import { getMonthlyBudgets } from "../server/budget.fns";
import { getTransactions } from "../server/transactions.fns";
import { CategoriesScreen } from "../ui/features/categories/categories.screen";
import {
  clampMonthKey,
  getMonthKey,
  monthKeyToViewDate,
} from "../ui/features/categories/categories.utils";
import { useTimeTravel } from "../ui/hooks/useTimeTravel";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

type CategoriesSearch = {
  category?: string;
  month?: string;
};

function categorySearchParam(value: unknown) {
  return typeof value === "string" && /^(child|group)-\d+$/.test(value) ? value : undefined;
}

function monthSearchParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return undefined;
  return clampMonthKey(value);
}

function cleanCategoriesSearch(search: CategoriesSearch): CategoriesSearch {
  return {
    category: categorySearchParam(search.category),
    month: monthSearchParam(search.month),
  };
}

export const Route = createFileRoute("/categories")({
  component: CategoriesRoute,
  beforeLoad: async () => await authStateFn(),
  validateSearch: (search: Record<string, unknown>): CategoriesSearch => ({
    category: categorySearchParam(search.category),
    month: monthSearchParam(search.month),
  }),
  loader: async () => {
    const [groups, transactions, budgets] = await Promise.all([
      getCategories(),
      getTransactions(),
      getMonthlyBudgets(),
    ]);
    return { groups, transactions, budgets };
  },
});

function CategoriesRoute() {
  const { groups, transactions, budgets } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { viewDate, setViewDate } = useTimeTravel();
  const hydratedFromUrl = useRef(false);

  useEffect(() => {
    if (hydratedFromUrl.current) return;
    hydratedFromUrl.current = true;
    if (search.month) setViewDate(monthKeyToViewDate(search.month));
  }, [search.month, setViewDate]);

  useEffect(() => {
    if (!hydratedFromUrl.current) return;
    const month = clampMonthKey(getMonthKey(viewDate));
    if (search.month === month) return;
    navigate({
      replace: true,
      search: (prev) => cleanCategoriesSearch({ ...prev, month }),
    });
  }, [navigate, search.month, viewDate]);

  return (
    <CategoriesScreen
      groups={groups}
      transactions={transactions}
      budgets={budgets}
      viewDate={viewDate}
      selectedCategoryKey={search.category}
      onSelectedCategoryKeyChange={(category) =>
        navigate({
          replace: true,
          search: (prev) => cleanCategoriesSearch({ ...prev, category }),
        })
      }
    />
  );
}
