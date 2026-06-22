import { useMemo, useState } from "react";
import { ACCOUNT_TYPE_CONFIG } from "./accounts.config";
import type { AccountGroup, AccountsData, TransactionsData } from "./accounts.types";

export function useAccountsViewModel({
  accounts,
  transactions,
}: {
  accounts: AccountsData;
  transactions: TransactionsData;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(accounts[0]?.id ?? null);

  const grouped = useMemo(
    () =>
      Object.entries(ACCOUNT_TYPE_CONFIG).reduce<Record<string, AccountGroup>>(
        (acc, [type, config]) => {
          const matching = accounts.filter((account) => account.type === type);
          if (matching.length > 0) acc[type] = { config, accounts: matching };
          return acc;
        },
        {},
      ),
    [accounts],
  );

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null;
  const accountTransactions = selectedAccount
    ? transactions.filter((tx) => tx.accountId === selectedAccount.id)
    : [];

  const totalAssets = accounts
    .filter((account) => !["credit", "loan"].includes(account.type))
    .reduce((sum, account) => sum + account.currentBalance, 0);
  const totalDebts = accounts
    .filter((account) => ["credit", "loan"].includes(account.type))
    .reduce((sum, account) => sum + Math.abs(account.currentBalance), 0);
  const netWorth = totalAssets - totalDebts;

  return {
    accountTransactions,
    grouped,
    netWorth,
    selectedAccount,
    setSelectedAccountId,
    totalAssets,
    totalDebts,
  };
}
