import { SettingsIcon } from "lucide-react";
import { Area, AreaChart, Tooltip as ChartTooltip } from "recharts";
import { formatCurrency } from "../../../lib/format";
import { useElementSize } from "../dashboard/dashboard.hooks";
import { ACCOUNT_CHART_RANGES } from "./accounts.config";
import type { NetWorthData } from "./accounts.types";

export function AccountSummaryCard({
  accountCount,
  netWorth,
  netWorthHistory,
  totalAssets,
  totalDebts,
}: {
  accountCount: number;
  netWorth: number;
  netWorthHistory: NetWorthData;
  totalAssets: number;
  totalDebts: number;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();

  return (
    <div className="rounded-3xl border border-divider/60 bg-content1 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-default-400">Net worth</div>
          <div className="mt-1 text-3xl font-black tracking-tight">
            {accountCount ? formatCurrency(netWorth) : "-"}
          </div>
          <div className="mt-2 text-xs text-default-400">
            {formatCurrency(totalAssets)} assets ·{" "}
            {formatCurrency(totalDebts)} debts
          </div>
        </div>
        <button
          type="button"
          aria-label="Account settings"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-default-500 hover:bg-content2"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
      <div ref={ref} className="mt-4 h-48 w-full min-w-0">
        {size.width > 0 && size.height > 0 ? (
          <AreaChart
            width={size.width}
            height={size.height}
            data={netWorthHistory}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
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
              type="linear"
              stroke="#17c964"
              strokeWidth={3}
              fill="url(#netWorthFill)"
            />
          </AreaChart>
        ) : null}
      </div>
      <div className="mt-2 flex justify-center gap-2">
        {ACCOUNT_CHART_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              range === "1W" ? "bg-content2 text-foreground" : "text-default-400 hover:text-foreground",
            ].join(" ")}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
