import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireAllowedSession } from "../lib/devAuth";
import { getTransactions } from "../server/transactions.fns";
import { RecurringsScreen } from "../ui/features/recurrings/recurrings.screen";

const authStateFn = createServerFn().handler(async () => {
  await requireAllowedSession();
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
