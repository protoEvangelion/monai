import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getCategories } from "../server/categories.fns";
import { getMonthlyBudgets } from "../server/budget.fns";
import { getTransactions, getTags } from "../server/transactions.fns";
import { CategoriesScreen } from "../ui/features/categories/categories.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/categories")({
  component: CategoriesRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [groups, transactions, budgets, tags] = await Promise.all([
      getCategories(),
      getTransactions(),
      getMonthlyBudgets(),
      getTags(),
    ]);
    return { groups, transactions, budgets, tags };
  },
});

function CategoriesRoute() {
  const { groups, transactions, budgets, tags } = Route.useLoaderData();
  return (
    <CategoriesScreen
      groups={groups}
      transactions={transactions}
      budgets={budgets}
      tags={tags}
    />
  );
}
