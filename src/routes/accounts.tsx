import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  getAccounts,
  getConnections,
  getNetWorthHistory,
} from "../server/accounts.fns";
import { getTransactions } from "../server/transactions.fns";
import { AccountsScreen } from "../ui/features/accounts/accounts.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
  return { userId };
});

export const Route = createFileRoute("/accounts")({
  component: AccountsRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => ({
    accounts: await getAccounts(),
    connections: await getConnections(),
    transactions: await getTransactions(),
    netWorthHistory: await getNetWorthHistory(),
  }),
});

function AccountsRoute() {
  const { accounts, connections, transactions, netWorthHistory } =
    Route.useLoaderData();
  return (
    <AccountsScreen
      accounts={accounts}
      connections={connections}
      transactions={transactions}
      netWorthHistory={netWorthHistory}
    />
  );
}
