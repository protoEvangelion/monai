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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center justify-between border-b border-divider/30 px-6 py-4">
        <h5 className="font-bold text-sm">Transactions to review</h5>
        <Link
          to="/transactions"
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
        >
          View all <ChevronRightIcon size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ReviewTable transactions={reviewTransactions} categories={categories} variant="dashboard" />
      </div>
    </div>
  );
}
