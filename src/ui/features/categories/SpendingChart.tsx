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
  day: number;
  label: string;
  spent: number;
  budget?: number;
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
      className="h-36 w-full min-w-0 overflow-hidden rounded-2xl border border-divider/40 bg-default-50"
    >
      {size.width > 0 && size.height > 0 ? (
        <ComposedChart
          width={size.width}
          height={size.height}
          data={data}
          margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148, 163, 184, 0.35)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis hide />
          <ChartTooltip
            formatter={(value, name) => {
              const numericValue =
                typeof value === "number" ? value : Number(value ?? 0);
              return [
                formatCurrency(numericValue),
                name === "spent" ? "Spent" : "Budget / day",
              ];
            }}
            labelFormatter={(label) => `Day ${label}`}
          />
          <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={`spent-${entry.day}`} fill="#22c55e" />
            ))}
          </Bar>
          {showBudgetLine ? (
            <Line
              type="monotone"
              dataKey="budget"
              stroke="#7dd3fc"
              strokeWidth={2}
              dot={false}
            />
          ) : null}
        </ComposedChart>
      ) : null}
    </div>
  );
}
