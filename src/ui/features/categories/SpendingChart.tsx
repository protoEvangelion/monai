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

function SpendingChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div className="rounded-xl border border-divider bg-background px-3 py-2 text-sm text-foreground shadow-lg">
      <p className="mb-1.5 font-semibold">{datum.label}</p>
      <p className="text-[#60a5fa]">Budget level : {formatCurrency(datum.budget)}</p>
      <p className="text-foreground">Spent : {formatCurrency(datum.spent)}</p>
    </div>
  );
}

function chartIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function SpendingChart({
  data,
  showBudgetLine,
  onMonthSelect,
}: {
  data: ChartDatum[];
  showBudgetLine: boolean;
  onMonthSelect?: (month: string) => void;
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

  const selectMonthAtIndex = (index: number | null) => {
    if (index == null || !onMonthSelect) return;
    const month = data[index]?.month;
    if (month) onMonthSelect(month);
  };

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
          style={onMonthSelect ? { cursor: "pointer" } : undefined}
          onClick={(state) => {
            selectMonthAtIndex(
              chartIndex(state?.activeIndex) ?? chartIndex(state?.activeTooltipIndex),
            );
          }}
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
          <ChartTooltip content={<SpendingChartTooltip />} />
          <Bar
            dataKey="spent"
            name="Spent"
            radius={[4, 4, 0, 0]}
            onClick={(item, index) => {
              const month =
                (item as { payload?: ChartDatum } | undefined)?.payload?.month ??
                data[index]?.month;
              if (month && onMonthSelect) onMonthSelect(month);
            }}
          >
            {data.map((entry) => (
              <Cell
                key={`spent-${entry.month}`}
                cursor={onMonthSelect ? "pointer" : undefined}
                fill={
                  entry.spent > entry.budget && entry.budget > 0
                    ? "#ef4444"
                    : entry.spent > 0
                      ? "#22c55e"
                      : "#94a3b8"
                }
                opacity={entry.isSelectedMonth ? 1 : 0.82}
                stroke={entry.isSelectedMonth ? "#0f172a" : undefined}
                strokeWidth={entry.isSelectedMonth ? 1.5 : 0}
              />
            ))}
          </Bar>
          {showBudgetLine ? (
            <Line
              type="monotone"
              dataKey="budget"
              name="Budget level"
              stroke="#60a5fa"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#60a5fa" }}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      ) : null}
    </div>
  );
}
