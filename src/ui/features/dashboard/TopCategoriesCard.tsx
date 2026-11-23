import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import type { DashboardTopGroup } from "./dashboard.types";

const COLORS = [
  "var(--chart-net-worth)",
  "var(--chart-assets)",
  "#9333ea",
  "#f5a524",
  "var(--chart-debts)",
];

export function TopCategoriesCard({ topGroups }: { topGroups: DashboardTopGroup[] }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center justify-between border-b border-divider/30 px-5 py-4">
        <h2 className="font-bold text-sm">Top categories</h2>
        <Link
          to="/categories"
          className="flex min-h-6 items-center gap-1 text-xs text-default-400 transition-colors hover:text-foreground"
        >
          View all <ChevronRightIcon size={14} />
        </Link>
      </div>
      {topGroups.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-default-300">No spending this month</p>
        </div>
      ) : (
        <div className="divide-y divide-divider/20">
          {topGroups.map((cat, i) => (
            <div
              key={cat.id}
              className="px-5 py-3 hover:bg-default-50/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-default-300 text-xs">▶</span>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-background"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                >
                  {cat.txCount}
                </span>
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(cat.totalSpent)}
                </span>
                {cat.totalBudget > 0 ? (
                  <span className="text-xs text-default-400 tabular-nums w-14 text-right shrink-0">
                    {formatCurrency(cat.totalBudget)}
                  </span>
                ) : null}
              </div>
              {cat.totalBudget > 0 ? (
                <div className="ml-9 h-1.5 bg-default-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((cat.totalSpent / cat.totalBudget) * 100, 100)}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
