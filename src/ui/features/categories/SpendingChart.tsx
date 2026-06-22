import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from "recharts";
import { formatCurrency } from "../../../lib/format";

type ChartDatum = {
  budget: number;
  isSelectedMonth: boolean;
  label: string;
  month: string;
  shortLabel: string;
  spent: number;
};

export function SpendingChart({
  data,
  showBudgetLine,
}: {
  data: ChartDatum[];
  showBudgetLine: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full min-w-0 overflow-hidden rounded-2xl border border-divider/40 bg-default-50"
    >
      {size.width > 0 && size.height > 0 ? (
        <ComposedChart
          width={size.width}
          height={size.height}
          data={data}
          margin={{ top: 12, right: 16, left: 12, bottom: 12 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148, 163, 184, 0.35)"
            vertical={false}
          />
          <XAxis
            dataKey="shortLabel"
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={4}
            tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
            tickMargin={8}
          />
          <YAxis hide />
          <ChartTooltip
            formatter={(value, name) => {
              const numericValue =
                typeof value === "number" ? value : Number(value ?? 0);
              return [
                formatCurrency(numericValue),
                name === "spent" ? "Spent" : "Budget level",
              ];
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            contentStyle={{
              backgroundColor: "var(--background)",
              border: "1px solid var(--color-divider)",
              borderRadius: 12,
              boxShadow: "0 12px 30px rgb(0 0 0 / 0.14)",
              color: "var(--foreground)",
            }}
          />
          <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={`spent-${entry.month}`}
                fill={
                  entry.spent > entry.budget && entry.budget > 0
                    ? "#ef4444"
                    : entry.spent > 0
                      ? "#22c55e"
                      : "#94a3b8"
                }
                opacity={entry.isSelectedMonth ? 1 : 0.82}
              />
            ))}
          </Bar>
          {showBudgetLine ? (
            <Line
              type="monotone"
              dataKey="budget"
              stroke="#60a5fa"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#60a5fa" }}
            />
          ) : null}
        </ComposedChart>
      ) : null}
    </div>
  );
}
