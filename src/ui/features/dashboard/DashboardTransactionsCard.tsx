import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { ReviewTable } from "../../shared/ReviewTable";
import type { DashboardCategoriesData, DashboardTransactionsData } from "./dashboard.types";

export function DashboardTransactionsCard({
  categories,
  transactions,
}: {
  categories: DashboardCategoriesData;
  transactions: DashboardTransactionsData;
}) {
  const reviewTransactions = useMemo(
    () => transactions.filter((tx) => !tx.isReviewed).slice(0, 100),
    [transactions],
  );

  return (
    <div className="h-full bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-divider/30">
        <h5 className="font-bold text-sm">Transactions to review</h5>
        <Link
          to="/transactions"
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
        >
          View all <ChevronRightIcon size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <ReviewTable transactions={reviewTransactions} categories={categories} />
      </div>
    </div>
  );
}
