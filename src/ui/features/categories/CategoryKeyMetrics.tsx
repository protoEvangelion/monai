import { InfoIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import type { CategoryYearMetric } from "./categories.metrics";

export function CategoryKeyMetrics({ metrics }: { metrics: CategoryYearMetric[] }) {
  return (
    <div className="border-b border-divider/30 px-5 py-4">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
        <div className="flex items-center gap-1.5">
          <span>Key metrics</span>
          <span
            aria-label="Key metrics summarize the visible monthly history"
            className="inline-flex text-default-400"
            title="Key metrics summarize the visible monthly history"
          >
            <InfoIcon size={13} />
          </span>
        </div>
        <span className="text-right">Spent/year</span>
        <span className="text-right">Avg monthly</span>
      </div>
      {metrics.length ? (
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div
              key={metric.year}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 text-sm"
            >
              <span className="font-semibold text-primary">{metric.year}</span>
              <span className="text-right font-bold tabular-nums text-foreground">
                {formatCurrency(metric.spent)}
              </span>
              <span className="text-right font-bold tabular-nums text-foreground">
                {formatCurrency(metric.averageMonthly)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-default-400">No monthly history yet.</p>
      )}
    </div>
  );
}
