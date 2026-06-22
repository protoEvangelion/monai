import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Line, LineChart, Tooltip as ChartTooltip } from "recharts";
import { formatCurrency } from "../../../lib/format";
import { useElementSize } from "./dashboard.hooks";
import type { DashboardNetWorthPoint } from "./dashboard.types";

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

  return (
    <div className="h-full bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between px-6 pt-5 pb-3">
        <div>
          <div
            className={`text-5xl font-black leading-tight tracking-tight ${
              hasAccounts ? "text-foreground" : "text-foreground/20"
            }`}
          >
            {hasAccounts ? formatCurrency(netWorth) : "-"}
          </div>
          <div className="text-default-400 text-sm mt-1">
            {hasAccounts
              ? `${formatCurrency(totalAssets)} assets · ${formatCurrency(totalDebts)} debts`
              : "Connect accounts to see net worth"}
          </div>
        </div>
        <Link
          to="/accounts"
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors mt-1"
        >
          Accounts <ChevronRightIcon size={14} />
        </Link>
      </div>

      <div ref={ref} className="h-[180px] w-full min-w-0">
        {!hasAccounts ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-default-300">Connect accounts to see net worth</p>
          </div>
        ) : size.width > 0 && size.height > 0 ? (
          <LineChart
            width={size.width}
            height={size.height}
            data={chartData}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <ChartTooltip
              content={({ payload }) =>
                payload?.length ? (
                  <div className="bg-background/90 border border-divider text-xs px-2 py-1 rounded-lg shadow-md">
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
              type="monotone"
              dataKey="assets"
              stroke="#006FEE"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "#006FEE" }}
            />
            <Line
              type="monotone"
              dataKey="debts"
              stroke="#f31260"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "#f31260" }}
            />
            <Line
              type="monotone"
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
