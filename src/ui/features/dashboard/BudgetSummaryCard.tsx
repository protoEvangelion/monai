import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, ChevronRightIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { centsToDollars } from "../categories/categories.utils";

export function BudgetSummaryCard({
  totalBudgeted,
  totalSpent,
  totalLeft,
  expectedIncome,
  actualIncome,
  remainingToAssignCents,
  isZeroBasedBalanced,
  overBudget,
}: {
  totalBudgeted: number;
  totalSpent: number;
  totalLeft: number;
  expectedIncome: number;
  actualIncome: number;
  remainingToAssignCents: number;
  isZeroBasedBalanced: boolean;
  overBudget: boolean;
}) {
  return (
    <div className="h-full bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <h5 className="font-bold text-sm">Zero-based budget</h5>
        <Link
          to="/categories"
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
        >
          Categories <ChevronRightIcon size={14} />
        </Link>
      </div>
      {totalBudgeted === 0 && expectedIncome === 0 ? (
        <p className="text-sm text-default-300 text-center py-6">
          Set expected income and allocations in Categories
        </p>
      ) : (
        <div className="space-y-4">
          <div
            className={`rounded-2xl border px-4 py-3 ${
              isZeroBasedBalanced
                ? "border-success/40 bg-success/10 text-success"
                : remainingToAssignCents < 0
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                  {isZeroBasedBalanced
                    ? "Ready"
                    : remainingToAssignCents < 0
                      ? "Overassigned"
                      : "Left to assign"}
                </div>
                <div className="mt-1 text-xl font-black tabular-nums">
                  {isZeroBasedBalanced
                    ? "Every dollar is assigned"
                    : formatCurrency(Math.abs(centsToDollars(remainingToAssignCents)))}
                </div>
              </div>
              {isZeroBasedBalanced ? <CheckCircle2Icon size={20} /> : null}
            </div>
          </div>

          <div className="flex justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
                Expected income
              </div>
              <div className="text-2xl font-black text-foreground tabular-nums">
                {formatCurrency(expectedIncome)}
              </div>
              <div className="text-xs text-default-400">
                {formatCurrency(actualIncome)} received
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
                Budgeted
              </div>
              <div className="text-2xl font-black text-foreground tabular-nums">
                {formatCurrency(totalBudgeted)}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-default-400 mb-2">
              <span>Spent</span>
              <span>
                {totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 999).toFixed(0) : "0"}
                %
              </span>
            </div>
            <div className="h-2 rounded-full bg-default-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${overBudget ? "bg-danger" : "bg-success"}`}
                style={{
                  width: `${totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0}%`,
                }}
              />
            </div>
            <div className="text-default-400 text-xs mt-2">
              {formatCurrency(totalSpent)} of{" "}
              {formatCurrency(totalBudgeted)} spent
              {overBudget
                ? ` · ${formatCurrency(Math.abs(totalLeft))} over spending plan`
                : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
