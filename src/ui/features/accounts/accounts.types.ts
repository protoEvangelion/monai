import type { getAccounts, getConnections, getNetWorthHistory } from "../../../server/accounts.fns";
import type { getTransactions } from "../../../server/transactions.fns";

export type AccountsData = Awaited<ReturnType<typeof getAccounts>>;
export type ConnectionsData = Awaited<ReturnType<typeof getConnections>>;
export type TransactionsData = Awaited<ReturnType<typeof getTransactions>>;
export type NetWorthData = Awaited<ReturnType<typeof getNetWorthHistory>>;

export type AccountTypeConfig = {
  label: string;
  icon: React.ReactNode;
  isDebt: boolean;
};

export type AccountGroup = {
  config: AccountTypeConfig;
  accounts: AccountsData;
};
