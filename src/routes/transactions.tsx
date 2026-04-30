import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getTransactions } from "../server/transactions.fns";
import { getCategoriesWithSpending } from "../server/categories.fns";
import { TransactionsScreen } from "../ui/features/transactions/transactions.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/transactions")({
  component: TransactionsRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [transactions, categories] = await Promise.all([
      getTransactions(),
      getCategoriesWithSpending(),
    ]);
    return { transactions, categories };
  },
});

function TransactionsRoute() {
  const { transactions, categories } = Route.useLoaderData();
  return (
    <TransactionsScreen transactions={transactions} categories={categories} />
  );
}
