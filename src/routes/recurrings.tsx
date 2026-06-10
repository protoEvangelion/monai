import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getTransactions } from "../server/transactions.fns";
import { RecurringsScreen } from "../ui/features/recurrings/recurrings.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/recurrings")({
  component: RecurringsRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => ({
    transactions: await getTransactions(),
  }),
});

function RecurringsRoute() {
  const { transactions } = Route.useLoaderData();
  return <RecurringsScreen transactions={transactions} />;
}
