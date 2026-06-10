import { useRouter } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
import {
  BriefcaseIcon,
  BuildingIcon,
  ChevronRightIcon,
  CreditCardIcon,
  HomeIcon,
  LandmarkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  createLinkToken,
  deleteAccount,
  exchangePublicToken,
  removeItem,
} from "../../../server/plaid.link.fns";
import {
  getAccounts,
  getConnections,
  getNetWorthHistory,
} from "../../../server/accounts.fns";
import { getTransactions } from "../../../server/transactions.fns";
import { formatCurrency } from "../../../lib/format";

type AccountsData = Awaited<ReturnType<typeof getAccounts>>;
type ConnectionsData = Awaited<ReturnType<typeof getConnections>>;
type TransactionsData = Awaited<ReturnType<typeof getTransactions>>;
type NetWorthData = Awaited<ReturnType<typeof getNetWorthHistory>>;

const typeConfig: Record<
  string,
  { label: string; icon: React.ReactNode; isDebt: boolean }
> = {
  credit: {
    label: "Credit cards",
    icon: <CreditCardIcon size={18} />,
    isDebt: true,
  },
  cash: {
    label: "Depository",
    icon: <LandmarkIcon size={18} />,
    isDebt: false,
  },
  investment: {
    label: "Investments",
    icon: <TrendingUpIcon size={18} />,
    isDebt: false,
  },
  loan: {
    label: "Loans",
    icon: <BriefcaseIcon size={18} />,
    isDebt: true,
  },
  real_estate: {
    label: "Real estate",
    icon: <HomeIcon size={18} />,
    isDebt: false,
  },
  other: {
    label: "Other",
    icon: <WalletIcon size={18} />,
    isDebt: false,
  },
};

const ranges = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

function AddAccountButton({
  label = "Add account",
  icon,
  variant = "primary",
  size = "md",
  onPress,
  isLoading,
}: {
  label?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
  onPress: () => void;
  isLoading: boolean;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      onPress={onPress}
      isDisabled={isLoading}
    >
      {isLoading ? (
        <Loader2Icon size={15} className="animate-spin" />
      ) : (
        (icon ?? <PlusIcon size={15} />)
      )}
      {isLoading ? "Connecting..." : label}
    </Button>
  );
}

export function AccountsScreen({
  accounts,
  connections,
  transactions,
  netWorthHistory,
}: {
  accounts: AccountsData;
  connections: ConnectionsData;
  transactions: TransactionsData;
  netWorthHistory: NetWorthData;
}) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null,
  );
  const [token, setToken] = useState<string | null>(null);
  const [isLinkLoading, setIsLinkLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<number | null>(null);

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess: async (publicToken, metadata) => {
      try {
        const institutionName = metadata?.institution?.name ?? undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (exchangePublicToken as any)({
          data: { publicToken, institutionName },
        });
        await router.invalidate();
      } finally {
        setIsLinkLoading(false);
        setToken(null);
      }
    },
    onExit: () => {
      setToken(null);
      setIsLinkLoading(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const grouped = useMemo(
    () =>
      Object.entries(typeConfig).reduce<
        Record<
          string,
          { config: (typeof typeConfig)[string]; accounts: AccountsData }
        >
      >((acc, [type, config]) => {
        const matching = accounts.filter((account) => account.type === type);
        if (matching.length > 0) acc[type] = { config, accounts: matching };
        return acc;
      }, {}),
    [accounts],
  );

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts[0] ??
    null;
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

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("Remove this account from Monai?")) return;
    setIsDeleting(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (deleteAccount as any)({ data: { id } });
      await router.invalidate();
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDisconnectBank = async (plaidItemId: number | null) => {
    if (!plaidItemId) return;
    if (!confirm("Disconnect this institution and remove its local data?"))
      return;
    setIsDisconnecting(plaidItemId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (removeItem as any)({ data: { id: plaidItemId } });
      await router.invalidate();
    } finally {
      setIsDisconnecting(null);
    }
  };

  const handleOpenPlaid = async () => {
    if (isLinkLoading) return;

    setIsLinkLoading(true);
    try {
      const linkToken = await createLinkToken();
      setToken(linkToken);
    } catch {
      setIsLinkLoading(false);
      setToken(null);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
          <h1 className="text-lg font-bold">Accounts</h1>
          <div className="flex items-center gap-2">
            <AddAccountButton
              label="Add"
              icon={<PlusIcon size={15} />}
              size="sm"
              onPress={handleOpenPlaid}
              isLoading={isLinkLoading}
            />
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-3xl border border-divider/60 bg-content1 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-default-400">
                  Net worth
                </div>
                <div className="mt-1 text-3xl font-black tracking-tight">
                  {accounts.length
                    ? formatCurrency(netWorth, { maximumFractionDigits: 0 })
                    : "—"}
                </div>
                <div className="mt-2 text-xs text-default-400">
                  {formatCurrency(totalAssets, { maximumFractionDigits: 0 })}{" "}
                  assets · {formatCurrency(totalDebts, { maximumFractionDigits: 0 })} debts
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                  ↗ 7.22%
                </div>
                <button
                  type="button"
                  aria-label="Account settings"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-default-500 hover:bg-content2"
                >
                  <SettingsIcon size={16} />
                </button>
              </div>
            </div>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthHistory}>
                  <defs>
                    <linearGradient id="netWorthFill" x1="0" x2="0" y1="0" y2="1">
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
                    dataKey="netWorth"
                    type="monotone"
                    stroke="#17c964"
                    strokeWidth={3}
                    fill="url(#netWorthFill)"
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

          {connections.length > 0 ? (
            <div className="rounded-2xl border border-divider/60 bg-content1 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <BuildingIcon size={15} /> Connections
                </h2>
                <AddAccountButton
                  label="New"
                  icon={<PlusIcon size={14} />}
                  variant="ghost"
                  size="sm"
                  onPress={handleOpenPlaid}
                  isLoading={isLinkLoading}
                />
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between rounded-xl border border-divider/50 bg-background/60 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {connection.institutionName ?? "Unknown institution"}
                      </div>
                      <div className="text-xs text-default-400">
                        {connection.accountCount} account
                        {connection.accountCount !== 1 ? "s" : ""} · richer
                        history enabled
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <AddAccountButton
                        label="Reconnect"
                        icon={<RefreshCwIcon size={14} />}
                        variant="ghost"
                        size="sm"
                        onPress={handleOpenPlaid}
                        isLoading={isLinkLoading}
                      />
                      <button
                        type="button"
                        aria-label="Disconnect institution"
                        disabled={isDisconnecting === connection.id}
                        onClick={() => handleDisconnectBank(connection.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        {isDisconnecting === connection.id ? (
                          <Loader2Icon size={15} className="animate-spin" />
                        ) : (
                          <Trash2Icon size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {Object.keys(grouped).length === 0 ? (
            <div className="flex min-h-[38vh] flex-col items-center justify-center rounded-3xl border border-divider/60 bg-content1 text-center">
              <LandmarkIcon size={34} className="text-default-300" />
              <h2 className="mt-4 text-base font-bold">No accounts linked</h2>
              <p className="mt-2 max-w-sm text-sm text-default-400">
                Connect a bank to import balances, transactions, and up to 730
                days of account history.
              </p>
              <div className="mt-5">
                <AddAccountButton
                  onPress={handleOpenPlaid}
                  isLoading={isLinkLoading}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([type, group]) => {
                const total = group.accounts.reduce(
                  (sum, account) => sum + account.currentBalance,
                  0,
                );
                return (
                  <section key={type}>
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-sm font-bold">
                        <span className="text-default-400">{group.config.icon}</span>
                        {group.config.label}
                      </h2>
                      <div
                        className={[
                          "text-sm font-black",
                          group.config.isDebt ? "text-danger" : "text-foreground",
                        ].join(" ")}
                      >
                        {formatCurrency(total)}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
                      {group.accounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setSelectedAccountId(account.id)}
                          className={[
                            "flex w-full cursor-pointer items-center gap-4 border-b border-divider/40 px-4 py-4 text-left last:border-b-0 hover:bg-content2",
                            selectedAccount?.id === account.id
                              ? "bg-primary/10"
                              : "",
                          ].join(" ")}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                            {group.config.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {account.name}
                            </div>
                            <div className="text-xs text-default-400">
                              {account.type} · history retained
                            </div>
                          </div>
                          <div className="rounded-full bg-success/15 px-2 py-1 text-xs font-bold text-success">
                            ↗ 3.22%
                          </div>
                          <div className="w-28 text-right text-sm font-bold">
                            {formatCurrency(account.currentBalance)}
                          </div>
                          <ChevronRightIcon
                            size={15}
                            className="text-default-300"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="hidden w-[430px] shrink-0 border-l border-divider/60 bg-content1 xl:block">
        {selectedAccount ? (
          <div className="flex h-full flex-col">
            <div className="flex h-14 items-center justify-between border-b border-divider/60 px-5">
              <h2 className="truncate text-sm font-bold">{selectedAccount.name}</h2>
              <div className="flex items-center gap-3 text-default-400">
                <button
                  type="button"
                  onClick={() => handleDeleteAccount(selectedAccount.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-danger/10 hover:text-danger"
                >
                  {isDeleting === selectedAccount.id ? (
                    <Loader2Icon size={15} className="animate-spin" />
                  ) : (
                    <Trash2Icon size={15} />
                  )}
                </button>
                <MoreHorizontalIcon size={18} />
                <XIcon size={18} />
              </div>
            </div>
            <div className="border-b border-divider/60 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-default-400">
                    {typeConfig[selectedAccount.type]?.label ?? "Account"}
                  </div>
                  <div className="mt-1 text-xl font-black">
                    {formatCurrency(selectedAccount.currentBalance)}
                  </div>
                  <div className="mt-1 text-xs text-default-400">
                    Imported balance plus historical snapshots
                  </div>
                </div>
                <div className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                  ↗ 33.73%
                </div>
              </div>
              <div className="mt-5 h-32 rounded-2xl bg-success/5 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netWorthHistory}>
                    <Area
                      dataKey="netWorth"
                      type="monotone"
                      stroke="#17c964"
                      strokeWidth={2.5}
                      fill="#17c96422"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <h3 className="mb-3 text-sm font-bold">Transactions</h3>
              {accountTransactions.slice(0, 18).map((tx) => (
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
                  <div
                    className={[
                      "text-sm font-bold",
                      tx.amount < 0 ? "text-success" : "text-foreground",
                    ].join(" ")}
                  >
                    {tx.amount < 0 ? "+" : ""}
                    {formatCurrency(Math.abs(tx.amount))}
                  </div>
                </div>
              ))}
              {accountTransactions.length === 0 ? (
                <div className="py-12 text-center text-sm text-default-400">
                  No transactions for this account yet.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-default-400">
            Select to view details
          </div>
        )}
      </aside>
    </div>
  );
}
