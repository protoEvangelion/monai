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
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <div
            className={`text-5xl font-black leading-tight tracking-tight ${
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
        <div className="flex flex-col items-end gap-2">
          <Link
            to="/accounts"
            className="mt-1 flex items-center gap-1 text-xs text-default-400 transition-colors hover:text-foreground"
          >
            Accounts <ChevronRightIcon size={14} />
          </Link>
          <div className="flex flex-wrap justify-end gap-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-bold",
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

      <div ref={ref} className="h-[180px] w-full min-w-0">
        {!hasAccounts ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-default-300">Connect accounts to see net worth</p>
          </div>
        ) : size.width > 0 && size.height > 0 ? (
          <LineChart
            width={size.width}
            height={size.height}
            data={filteredData}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <ChartTooltip
              content={({ payload }) =>
                payload?.length ? (
                  <div className="rounded-lg border border-divider bg-background/90 px-2 py-1 text-xs shadow-md">
                    <div className="mb-1">{payload[0].payload.dateLabel}</div>
                    <div className="text-[#17c964]">
                      Net worth:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "netWorth")?.value as number) ||
                          0,
                      )}
                    </div>
                    <div className="text-[#006FEE]">
                      Assets:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "assets")?.value as number) || 0,
                      )}
                    </div>
                    <div className="text-[#f31260]">
                      Debts:{" "}
                      {formatCurrency(
                        (payload.find((item) => item.dataKey === "debts")?.value as number) || 0,
                      )}
                    </div>
                  </div>
                ) : null
              }
            />
            <Line
              type="linear"
              dataKey="assets"
              stroke="#006FEE"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "#006FEE" }}
            />
            <Line
              type="linear"
              dataKey="debts"
              stroke="#f31260"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "#f31260" }}
            />
            <Line
              type="linear"
              dataKey="netWorth"
              stroke="#17c964"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#17c964" }}
            />
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}
