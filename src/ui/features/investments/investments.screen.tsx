import { useState, useTransition } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  Loader2Icon,
  RefreshCwIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { Line, LineChart, Tooltip as ChartTooltip } from "recharts";
import { formatCurrency, formatPercent, formatRelativeTime } from "../../../lib/format";
import { getInvestmentsDashboard, syncInvestmentsNow } from "../../../server/investments.fns";
import { useElementSize } from "../dashboard/dashboard.hooks";

type InvestmentsData = Awaited<ReturnType<typeof getInvestmentsDashboard>>;
type InvestmentAccount = InvestmentsData["accounts"][number];
type HistoryPoint = InvestmentsData["history"][number];

const ranges = ["1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof ranges)[number];

function filterHistory(history: HistoryPoint[], range: Range) {
  if (!history.length || range === "ALL") return history;
  const now = new Date();
  const start = new Date(now);
  if (range === "1W") start.setUTCDate(start.getUTCDate() - 7);
  else if (range === "1M") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (range === "3M") start.setUTCMonth(start.getUTCMonth() - 3);
  else if (range === "YTD") {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  const filtered = history.filter((point) => new Date(point.date).getTime() >= start.getTime());
  return filtered.length ? filtered : history.slice(-Math.min(2, history.length));
}

function changeFromHistory(history: HistoryPoint[]) {
  if (history.length < 2) return null;
  const first = history[0]!.balance;
  const last = history[history.length - 1]!.balance;
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) > 200) return null;
  return pct;
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) {
    return <div className="h-8 w-16 rounded bg-content2/60" />;
  }
  const data = values.map((balance, index) => ({ index, balance }));
  return (
    <LineChart width={64} height={32} data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
      <Line
        type="linear"
        dataKey="balance"
        stroke={positive ? "#17c964" : "#f31260"}
        strokeWidth={1.75}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

function BalanceChart({
  totalBalance,
  history,
  range,
  onRangeChange,
}: {
  totalBalance: number;
  history: HistoryPoint[];
  range: Range;
  onRangeChange: (range: Range) => void;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const filtered = filterHistory(history, range);
  const change = changeFromHistory(filtered);
  const changeLabel = formatPercent(change);

  return (
    <div className="rounded-3xl border border-divider/60 bg-content1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-default-400">Total balance</div>
          <div className="mt-1 text-3xl font-black tracking-tight">
            {formatCurrency(totalBalance, {
              maximumFractionDigits: 0,
              minimumFractionDigits: 0,
            })}
          </div>
          {changeLabel ? (
            <div
              className={[
                "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                (change ?? 0) >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
              ].join(" ")}
            >
              <span>{changeLabel}</span>
              <span className="font-semibold opacity-70">{range}</span>
            </div>
          ) : (
            <div className="mt-2 inline-flex rounded-full bg-content2 px-2.5 py-1 text-xs font-bold text-default-500">
              Linked balance
            </div>
          )}
        </div>
      </div>

      <div ref={ref} className="mt-4 h-48 w-full min-w-0">
        {filtered.length < 2 || size.width === 0 || size.height === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-divider/70 bg-background/50 px-6 text-center text-sm text-default-400">
            {filtered.length
              ? "Not enough history for a chart yet — sync again over a few days"
              : "Connect investment accounts to see balance history"}
          </div>
        ) : (
          <LineChart
            width={size.width}
            height={size.height}
            data={filtered}
            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          >
            <ChartTooltip
              content={({ payload }) =>
                payload?.length ? (
                  <div className="rounded-lg border border-divider bg-background/90 px-2 py-1 text-xs shadow-md">
                    <div className="mb-1 text-default-400">{payload[0].payload.dateLabel}</div>
                    <div className="font-semibold text-success">
                      {formatCurrency(payload[0].payload.balance as number)}
                    </div>
                  </div>
                ) : null
              }
            />
            <Line
              type="linear"
              dataKey="balance"
              stroke="#17c964"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#17c964" }}
            />
          </LineChart>
        )}
      </div>

      <div className="mt-2 flex justify-center gap-2">
        {ranges.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRangeChange(item)}
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              item === range ? "bg-content2 text-foreground" : "text-default-400 hover:text-foreground",
            ].join(" ")}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountDetailPanel({
  account,
  onClose,
  hasAnyHoldings,
}: {
  account: InvestmentAccount | null;
  onClose: () => void;
  hasAnyHoldings: boolean;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const { ref, size } = useElementSize<HTMLDivElement>();
  const filtered = account ? filterHistory(account.history, range) : [];
  const change = changeFromHistory(filtered);
  const changeLabel = formatPercent(change);

  if (!account) {
    return (
      <aside className="hidden w-[420px] shrink-0 border-l border-divider/60 bg-content1 xl:flex xl:items-center xl:justify-center">
        <div className="text-sm text-default-400">Select an account to view details</div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[420px] shrink-0 border-l border-divider/60 bg-content1 xl:block">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-divider/60 px-5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{account.name}</h2>
            <div className="text-xs text-default-400">
              {formatRelativeTime(account.lastSyncedAt)}
              {account.institutionName ? ` · ${account.institutionName}` : ""}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-default-400 hover:bg-content2"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="border-b border-divider/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-default-400">Balance</div>
                <div className="mt-1 text-xl font-black">{formatCurrency(account.currentBalance)}</div>
              </div>
              {changeLabel ? (
                <div
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-bold",
                    (change ?? 0) >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                  ].join(" ")}
                >
                  {changeLabel} {range}
                </div>
              ) : null}
            </div>

            <div ref={ref} className="mt-4 h-28 w-full min-w-0">
              {filtered.length >= 2 && size.width > 0 && size.height > 0 ? (
                <LineChart
                  width={size.width}
                  height={size.height}
                  data={filtered}
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <Line
                    type="linear"
                    dataKey="balance"
                    stroke="#17c964"
                    strokeWidth={2}
                    dot={filtered.length <= 8}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-divider/70 text-xs text-default-400">
                  Need at least two sync days for a chart
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-center gap-1.5">
              {ranges.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    item === range ? "bg-content2 text-foreground" : "text-default-400",
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-divider/60 p-5">
            <h3 className="mb-3 text-sm font-bold">Allocations</h3>
            {account.allocations.length ? (
              <div className="space-y-3">
                {account.allocations.map((allocation) => (
                  <div key={allocation.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold">{allocation.label}</span>
                      <span className="text-default-400">{allocation.percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-content2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, Math.max(0, allocation.percent))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-400">
                {hasAnyHoldings
                  ? "No holdings mapped to this account."
                  : "Enable Plaid Investments on this connection, then Sync holdings."}
              </p>
            )}
          </div>

          <div className="p-5">
            <h3 className="mb-3 text-sm font-bold">Holdings</h3>
            {account.holdings.length ? (
              <div className="space-y-1">
                {account.holdings.map((holding) => {
                  const gainLabel = formatPercent(holding.gainPercent);
                  return (
                    <div
                      key={holding.id}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-content2/60"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {holding.security.tickerSymbol ?? holding.security.name}
                        </div>
                        <div className="truncate text-xs text-default-400">
                          {holding.security.name}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {gainLabel ? (
                          <div
                            className={[
                              "text-xs font-bold",
                              (holding.gainPercent ?? 0) >= 0 ? "text-success" : "text-danger",
                            ].join(" ")}
                          >
                            {gainLabel}
                          </div>
                        ) : null}
                        <div className="text-sm font-bold">
                          {formatCurrency(holding.institutionValue)}
                        </div>
                        {holding.institutionPrice != null ? (
                          <div className="text-[11px] text-default-400">
                            {formatCurrency(holding.institutionPrice)} / sh
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-default-400">
                Individual securities will show here after Investments product sync.
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function InvestmentsScreen({ data }: { data: InvestmentsData }) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("3M");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    data.accounts[0]?.id ?? null,
  );
  const [isSyncing, startSync] = useTransition();

  const selectedAccount =
    selectedAccountId == null
      ? null
      : (data.accounts.find((account) => account.id === selectedAccountId) ?? null);

  const handleSync = () => {
    startSync(async () => {
      await syncInvestmentsNow();
      await router.invalidate();
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
          <h1 className="text-lg font-bold">Investments</h1>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-divider px-3 text-xs font-bold hover:bg-content2 disabled:opacity-60"
          >
            {isSyncing ? <Loader2Icon size={14} className="animate-spin" /> : <RefreshCwIcon size={14} />}
            Sync
          </button>
        </div>

        <div className="space-y-6 p-6">
          <BalanceChart
            totalBalance={data.totalBalance}
            history={data.history}
            range={range}
            onRangeChange={setRange}
          />

          {data.topMovers.length ? (
            <section>
              <h2 className="mb-2 text-sm font-bold">Top movers</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {data.topMovers.map((mover) => {
                  const gainLabel = formatPercent(mover.gainPercent);
                  const positive = (mover.gainPercent ?? 0) >= 0;
                  return (
                    <button
                      key={`${mover.accountId}-${mover.id}`}
                      type="button"
                      onClick={() => setSelectedAccountId(mover.accountId)}
                      className="min-w-[160px] rounded-2xl border border-divider/60 bg-content1 px-4 py-3 text-left hover:bg-content2"
                    >
                      <div className="text-sm font-bold">
                        {mover.security.tickerSymbol ?? mover.security.name}
                      </div>
                      <div className="truncate text-xs text-default-400">{mover.security.name}</div>
                      <div
                        className={[
                          "mt-3 text-sm font-bold",
                          positive ? "text-success" : "text-danger",
                        ].join(" ")}
                      >
                        {gainLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <TrendingUpIcon size={15} /> Accounts
              </h2>
              <span className="text-xs font-bold uppercase tracking-wide text-default-400">
                change · balance
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
              {data.accounts.length ? (
                data.accounts.map((account) => {
                  const changeLabel = formatPercent(account.changePercent);
                  const positive = (account.changePercent ?? 0) >= 0;
                  const selected = selectedAccount?.id === account.id;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className={[
                        "flex w-full cursor-pointer items-center gap-3 border-b border-divider/40 px-4 py-4 text-left last:border-b-0 hover:bg-content2",
                        selected ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "",
                      ].join(" ")}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                        <TrendingUpIcon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{account.name}</div>
                        <div className="text-xs text-default-400">
                          {formatRelativeTime(account.lastSyncedAt)}
                          {account.institutionName ? ` · ${account.institutionName}` : ""}
                        </div>
                      </div>
                      <Sparkline values={account.sparkline} positive={positive} />
                      {changeLabel ? (
                        <div
                          className={[
                            "w-[4.5rem] shrink-0 rounded-full px-2 py-1 text-center text-xs font-bold",
                            positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                          ].join(" ")}
                        >
                          {changeLabel}
                        </div>
                      ) : (
                        <div className="w-[4.5rem] shrink-0" />
                      )}
                      <div className="w-28 shrink-0 text-right text-sm font-bold">
                        {formatCurrency(account.currentBalance)}
                      </div>
                      <ChevronRightIcon size={15} className="shrink-0 text-default-300" />
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-10 text-center text-sm text-default-400">
                  No investment accounts linked yet.
                </div>
              )}
            </div>
          </section>

          {!data.hasHoldings ? (
            <section className="rounded-2xl border border-dashed border-divider/70 bg-content1/60 px-4 py-5 text-center">
              <p className="text-sm text-default-500">
                Holdings need the Plaid <span className="font-semibold text-foreground">Investments</span>{" "}
                product on each brokerage link. Balances sync without it; tickers do not.
              </p>
            </section>
          ) : null}
        </div>
      </section>

      <AccountDetailPanel
        account={selectedAccount}
        onClose={() => setSelectedAccountId(null)}
        hasAnyHoldings={data.hasHoldings}
      />
    </div>
  );
}
