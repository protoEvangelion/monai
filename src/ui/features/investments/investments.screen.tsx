import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { getAccounts } from "../../../server/accounts.fns";
import { getTransactions } from "../../../server/transactions.fns";

type AccountsData = Awaited<ReturnType<typeof getAccounts>>;
type TransactionsData = Awaited<ReturnType<typeof getTransactions>>;

const ranges = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

export function InvestmentsScreen({
  accounts,
  transactions,
}: {
  accounts: AccountsData;
  transactions: TransactionsData;
}) {
  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment"),
    [accounts],
  );
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    investmentAccounts[0]?.id ?? null,
  );
  const selectedAccount =
    investmentAccounts.find((account) => account.id === selectedAccountId) ??
    investmentAccounts[0] ??
    null;

  const totalBalance = investmentAccounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  );
  const investmentTransactions = selectedAccount
    ? transactions.filter((tx) => tx.accountId === selectedAccount.id)
    : [];

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
          <h1 className="text-lg font-bold">Investments</h1>
          <button
            type="button"
            aria-label="Investment settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-default-500 hover:bg-content2"
          >
            <SettingsIcon size={16} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-3xl border border-divider/60 bg-content1 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-default-400">
                  Total balance
                </div>
                <div className="mt-1 text-3xl font-black tracking-tight">
                  {formatCurrency(totalBalance)}
                </div>
                <div className="mt-2 inline-flex rounded-full bg-content2 px-2.5 py-1 text-xs font-bold text-default-500">
                  Current linked balance
                </div>
              </div>
              <div className="text-xs font-semibold text-default-400">
                730-day history
              </div>
            </div>
            <div className="mt-4 flex h-48 items-center justify-center rounded-2xl border border-dashed border-divider/70 bg-background/50 px-6 text-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Balance history pending</p>
                <p className="mt-2 max-w-md text-sm text-default-400">
                  Investment-specific historical balances are not exposed to this screen yet.
                  Showing current linked balances avoids implying fake performance.
                </p>
              </div>
            </div>
            <div className="mt-2 flex justify-center gap-2">
              {ranges.map((range) => (
                <button
                  key={range}
                  type="button"
                  className={[
                    "rounded-full px-3 py-1 text-xs font-bold",
                    range === "1W"
                      ? "bg-content2 text-foreground"
                      : "text-default-400 hover:text-foreground",
                  ].join(" ")}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <TrendingUpIcon size={15} /> Accounts
              </h2>
              <span className="text-xs font-bold uppercase tracking-wide text-default-400">
                current balance
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
              {investmentAccounts.length ? (
                investmentAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setSelectedAccountId(account.id)}
                    className={[
                      "flex w-full cursor-pointer items-center gap-4 border-b border-divider/40 px-4 py-4 text-left last:border-b-0 hover:bg-content2",
                      selectedAccount?.id === account.id ? "bg-primary/10" : "",
                    ].join(" ")}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
                      <TrendingUpIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {account.name}
                      </div>
                      <div className="text-xs text-default-400">
                        Synced from linked account
                      </div>
                    </div>
                    <div className="w-28 text-right text-sm font-bold">
                      {formatCurrency(account.currentBalance)}
                    </div>
                    <ChevronRightIcon size={15} className="text-default-300" />
                  </button>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-default-400">
                  No investment accounts linked yet.
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                Portfolio details
              </h2>
              <span className="text-xs font-bold uppercase tracking-wide text-default-400">
                from linked providers
              </span>
            </div>
            <div className="rounded-2xl border border-divider/60 bg-content1 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-foreground">Holdings are not imported yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-default-400">
                Monai is currently showing investment account balances and activity. Individual
                securities, allocation, and performance should stay hidden until those fields are
                available from the data provider.
              </p>
            </div>
          </section>
        </div>
      </section>

      <aside className="hidden w-[420px] shrink-0 border-l border-divider/60 bg-content1 xl:block">
        {selectedAccount ? (
          <div className="flex h-full flex-col">
            <div className="flex h-14 items-center justify-between border-b border-divider/60 px-5">
              <h2 className="truncate text-sm font-bold">{selectedAccount.name}</h2>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-divider px-3 py-1.5 text-sm font-semibold">
                  Manage connection
                </button>
                <MoreHorizontalIcon size={18} className="text-default-400" />
                <XIcon size={18} className="text-default-400" />
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-default-400">Investment account</div>
                  <div className="mt-1 text-xl font-black">
                    {formatCurrency(selectedAccount.currentBalance)}
                  </div>
                </div>
                <div className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                  Synced
                </div>
              </div>
              <div className="mt-5 h-32 rounded-2xl bg-success/5 p-2">
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-success/20 text-center text-xs text-default-400">
                  Account balance history unavailable
                </div>
              </div>
            </div>
            <div className="border-t border-divider/60 p-5">
              <h3 className="mb-3 text-sm font-bold">Recent activity</h3>
              {investmentTransactions.slice(0, 8).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b border-divider/40 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {tx.merchantName}
                    </div>
                    <div className="text-xs text-default-400">
                      {new Date(tx.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm font-bold">
                    {formatCurrency(Math.abs(tx.amount))}
                  </div>
                </div>
              ))}
              {investmentTransactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-default-400">
                  No recent investment activity.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-default-400">
            Select to view details
          </div>
        )}
      </aside>
    </div>
  );
}
