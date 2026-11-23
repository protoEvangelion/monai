import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, Tooltip as ChartTooltip } from "recharts";
import { formatCurrency } from "../../../lib/format";
import { useElementSize } from "./dashboard.hooks";
import type { DashboardNetWorthPoint } from "./dashboard.types";

const NET_WORTH_RANGE_KEY = "monai.dashboard.netWorthRange";
const ranges = ["1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
export type NetWorthRange = (typeof ranges)[number];

function readStoredRange(): NetWorthRange {
  if (typeof window === "undefined") return "1M";
  try {
    const value = window.localStorage.getItem(NET_WORTH_RANGE_KEY);
    if (value && (ranges as readonly string[]).includes(value)) {
      return value as NetWorthRange;
    }
  } catch {
    // ignore
  }
  return "1M";
}

function pointTime(point: DashboardNetWorthPoint) {
  if (point.date instanceof Date) return point.date.getTime();
  if (typeof point.date === "string" || typeof point.date === "number") {
    const parsed = new Date(point.date).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (point.dayKey) {
    const parsed = new Date(point.dayKey).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function filterByRange(data: DashboardNetWorthPoint[], range: NetWorthRange) {
  if (!data.length || range === "ALL") return data;
  const times = data.map(pointTime).filter((value): value is number => value != null);
  const end = times.length ? Math.max(...times) : Date.now();
  const start = new Date(end);
  if (range === "1W") start.setUTCDate(start.getUTCDate() - 7);
  else if (range === "1M") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (range === "3M") start.setUTCMonth(start.getUTCMonth() - 3);
  else if (range === "YTD") {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  const startMs = start.getTime();
  const filtered = data.filter((point) => {
    const time = pointTime(point);
    return time == null || time >= startMs;
  });
  return filtered.length ? filtered : data.slice(-Math.min(2, data.length));
}

export function NetWorthCard({
  hasAccounts,
  netWorth,
  totalAssets,
  totalDebts,
  chartData,
}: {
  hasAccounts: boolean;
  netWorth: number;
  totalAssets: number;
  totalDebts: number;
  chartData: DashboardNetWorthPoint[];
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [range, setRange] = useState<NetWorthRange>("1M");

  useEffect(() => {
    setRange(readStoredRange());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(NET_WORTH_RANGE_KEY, range);
    } catch {
      // ignore
    }
  }, [range]);

  const filteredData = useMemo(() => filterByRange(chartData, range), [chartData, range]);

  return (
    <div className="h-full overflow-hidden rounded-2xl bg-card">
      <div className="flex flex-col gap-3 px-6 pt-5 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div
            className={`text-4xl font-black leading-tight tracking-tight sm:text-5xl ${
              hasAccounts ? "text-foreground" : "text-foreground/20"
            }`}
          >
            {hasAccounts ? formatCurrency(netWorth) : "-"}
          </div>
          <div className="mt-1 text-sm text-default-400">
            {hasAccounts
              ? `${formatCurrency(totalAssets)} assets · ${formatCurrency(totalDebts)} debts`
              : "Connect accounts to see net worth"}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link
            to="/accounts"
            className="flex min-h-6 items-center gap-1 text-xs text-default-400 transition-colors hover:text-foreground sm:mt-1"
          >
            Accounts <ChevronRightIcon size={14} />
          </Link>
          {/* Scrolls instead of stacking, so the control never leaves the card. */}
          <div
            role="group"
            aria-label="Net worth time range"
            className="flex max-w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:justify-end"
          >
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                aria-pressed={item === range}
                className={[
                  "flex min-h-8 shrink-0 items-center rounded-full px-3 text-[11px] font-bold tracking-wide",
                  item === range
                    ? "bg-content2 text-foreground"
                    : "text-default-400 hover:text-foreground",
                ].join(" ")}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={ref}
        className="h-[180px] w-full min-w-0"
        role="img"
        aria-label={
          hasAccounts
            ? `Net worth history for ${range}: currently ${formatCurrency(netWorth)}, ${formatCurrency(totalAssets)} in assets and ${formatCurrency(totalDebts)} in debts over the visible range.`
            : "Net worth chart, no accounts connected"
        }
      >
        {!hasAccounts ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-default-300">Connect accounts to see net worth</p>
          </div>
        ) : size.width > 0 && size.height > 0 ? (
          <LineChart
            width={size.width}
            height={size.height}
            data={filteredData}
            accessibilityLayer={false}
            margin={{ top: 6, right: 0, left: 0, bottom: 8 }}
          >
            <ChartTooltip
              content={({ payload }) =>
                payload?.length ? (
                  <div className="rounded-lg border border-divider bg-background/90 px-2 py-1 text-xs shadow-md">
                    <div className="mb-1">{payload[0].payload.dateLabel}</div>
                    <div className="text-chart-net-worth">
                      Net worth:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "netWorth")?.value as number) ||
                          0,
                      )}
                    </div>
                    <div className="text-chart-assets">
                      Assets:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "assets")?.value as number) || 0,
                      )}
                    </div>
                    <div className="text-chart-debts">
                      Debts:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "debts")?.value as number) || 0,
                      )}
                    </div>
                  </div>
                ) : null
              }
            />
            {/* `isAnimationActive={false}`: the draw-in leaves the paths at
                `stroke-dasharray: 0px, Npx`, so the line never becomes visible
                after the width measurement re-renders the chart. */}
            <Line
              type="linear"
              dataKey="assets"
              stroke="var(--chart-assets)"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "var(--chart-assets)" }}
            />
            <Line
              type="linear"
              dataKey="debts"
              stroke="var(--chart-debts)"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "var(--chart-debts)" }}
            />
            <Line
              type="linear"
              dataKey="netWorth"
              stroke="var(--chart-net-worth)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "var(--chart-net-worth)" }}
            />
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}
