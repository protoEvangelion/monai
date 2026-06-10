import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getAccounts, getNetWorthHistory } from "../server/accounts.fns";
import { getTransactions } from "../server/transactions.fns";
import { InvestmentsScreen } from "../ui/features/investments/investments.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/investments")({
  component: InvestmentsRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [accounts, transactions, netWorthHistory] = await Promise.all([
      getAccounts(),
      getTransactions(),
      getNetWorthHistory(),
    ]);
    return { accounts, transactions, netWorthHistory };
  },
});

function InvestmentsRoute() {
  const { accounts, transactions, netWorthHistory } = Route.useLoaderData();
  return (
    <InvestmentsScreen
      accounts={accounts}
      transactions={transactions}
      netWorthHistory={netWorthHistory}
    />
  );
}
