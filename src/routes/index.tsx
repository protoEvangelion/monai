import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getCategoriesWithSpending } from "../server/categories.fns";
import { getTransactions } from "../server/transactions.fns";
import { getAccounts, getNetWorthHistory } from "../server/accounts.fns";
import { getMonthlyBudgets } from "../server/budget.fns";
import { DashboardScreen } from "../ui/features/dashboard/dashboard.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/")({
  component: DashboardRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [categories, transactions, accounts, netWorthHistory, budgets] =
      await Promise.all([
        getCategoriesWithSpending(),
        getTransactions(),
        getAccounts(),
        getNetWorthHistory(),
        getMonthlyBudgets(),
      ]);
    return { categories, transactions, accounts, netWorthHistory, budgets };
  },
});

function DashboardRoute() {
  const { categories, transactions, accounts, netWorthHistory, budgets } =
    Route.useLoaderData();
  return (
    <DashboardScreen
      categories={categories}
      transactions={transactions}
      accounts={accounts}
      netWorthHistory={netWorthHistory}
      budgets={budgets}
    />
  );
}
