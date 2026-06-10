import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
import {
  BarChart3Icon,
  ChevronRightIcon,
  Layers3Icon,
  MoreHorizontalIcon,
  SettingsIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { getAccounts, getNetWorthHistory } from "../../../server/accounts.fns";
import { getTransactions } from "../../../server/transactions.fns";

type AccountsData = Awaited<ReturnType<typeof getAccounts>>;
type TransactionsData = Awaited<ReturnType<typeof getTransactions>>;
type NetWorthData = Awaited<ReturnType<typeof getNetWorthHistory>>;

const ranges = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

const demoHoldings = [
  { ticker: "VTI", name: "Total Stock Market ETF", price: 302.41, change: 1.42 },
  { ticker: "VXUS", name: "International Stock ETF", price: 67.18, change: 0.28 },
  { ticker: "BND", name: "Total Bond Market ETF", price: 73.52, change: -0.11 },
];

export function InvestmentsScreen({
  accounts,
  transactions,
  netWorthHistory,
}: {
  accounts: AccountsData;
  transactions: TransactionsData;
  netWorthHistory: NetWorthData;
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
  const chartData = netWorthHistory.map((point, index) => {
    const progress =
      netWorthHistory.length > 1 ? index / (netWorthHistory.length - 1) : 1;
    return {
      ...point,
      value:
        totalBalance > 0
          ? Math.max(0, Math.round(totalBalance * (0.88 + progress * 0.16)))
          : 0,
    };
  });

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
                  {formatCurrency(totalBalance, { maximumFractionDigits: 0 })}
                </div>
                <div className="mt-2 inline-flex rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                  ↗ 2.32%
                </div>
              </div>
              <div className="text-xs font-semibold text-default-400">
                730-day history
              </div>
            </div>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="investmentFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#17c964" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#17c964" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <ChartTooltip
                    content={({ payload }) =>
                      payload?.length ? (
                        <div className="rounded-xl border border-divider bg-background px-3 py-2 text-xs shadow-lg">
                          {formatCurrency(Number(payload[0].value ?? 0))}
                        </div>
                      ) : null
                    }
                  />
                  <Area
                    dataKey="value"
                    type="monotone"
                    stroke="#17c964"
                    strokeWidth={3}
                    fill="url(#investmentFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
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
                1W balance change
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
                    <div className="rounded-full bg-success/15 px-2 py-1 text-xs font-bold text-success">
                      ↗ 2.33%
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
                <Layers3Icon size={15} /> Allocation
              </h2>
              <span className="text-xs font-bold uppercase tracking-wide text-default-400">
                by percentage
              </span>
            </div>
            <div className="rounded-2xl border border-divider/60 bg-content1 p-4">
              <div className="mb-2 flex justify-between text-sm">
                <span>Equities</span>
                <span className="font-bold">82%</span>
              </div>
              <div className="h-2 rounded-full bg-content2">
                <div className="h-full w-[82%] rounded-full bg-primary" />
              </div>
              <div className="mt-4 mb-2 flex justify-between text-sm">
                <span>Bonds and cash</span>
                <span className="font-bold">18%</span>
              </div>
              <div className="h-2 rounded-full bg-content2">
                <div className="h-full w-[18%] rounded-full bg-success" />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <BarChart3Icon size={15} /> Holdings
              </h2>
              <span className="text-xs font-bold uppercase tracking-wide text-default-400">
                last price
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
              {demoHoldings.map((holding) => (
                <div
                  key={holding.ticker}
                  className="grid grid-cols-[5rem_minmax(0,1fr)_6rem_6rem] items-center gap-3 border-b border-divider/40 px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm font-bold text-default-500">
                    {holding.ticker}
                  </span>
                  <span className="truncate text-sm">{holding.name}</span>
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-center text-xs font-bold",
                      holding.change >= 0
                        ? "bg-success/15 text-success"
                        : "bg-danger/15 text-danger",
                    ].join(" ")}
                  >
                    {holding.change >= 0 ? "↗" : "↘"} {Math.abs(holding.change)}%
                  </span>
                  <span className="text-right text-sm font-bold">
                    {formatCurrency(holding.price)}
                  </span>
                </div>
              ))}
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
                  ↗ 2.33%
                </div>
              </div>
              <div className="mt-5 h-32 rounded-2xl bg-success/5 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <Area
                      dataKey="value"
                      type="monotone"
                      stroke="#17c964"
                      strokeWidth={2.5}
                      fill="#17c96422"
                    />
                  </AreaChart>
                </ResponsiveContainer>
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
