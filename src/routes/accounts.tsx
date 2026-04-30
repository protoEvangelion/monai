import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getAccounts, getConnections } from "../server/accounts.fns";
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
  }),
});

function AccountsRoute() {
  const { accounts, connections } = Route.useLoaderData();
  return <AccountsScreen accounts={accounts} connections={connections} />;
}
