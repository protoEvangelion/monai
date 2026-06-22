import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import type { DashboardTopGroup } from "./dashboard.types";

const COLORS = ["#17c964", "#006FEE", "#9333ea", "#f5a524", "#f31260"];

export function TopCategoriesCard({ topGroups }: { topGroups: DashboardTopGroup[] }) {
  return (
    <div className="h-full bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-divider/30">
        <h5 className="font-bold text-sm">Top categories</h5>
        <Link
          to="/categories"
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
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
                  className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
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
