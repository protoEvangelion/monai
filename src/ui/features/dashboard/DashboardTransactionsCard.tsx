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
    () => transactions.filter((tx) => !tx.isReviewed),
    [transactions],
  );

  return (
    <div className="flex h-[min(40rem,70vh)] min-h-[24rem] flex-col overflow-hidden rounded-2xl bg-card xl:h-full">
      <div className="flex items-center justify-between border-b border-divider/30 px-6 py-4">
        <h2 className="font-bold text-sm">Transactions to review</h2>
        <Link
          to="/transactions"
          className="flex min-h-6 items-center gap-1 text-xs text-default-400 transition-colors hover:text-foreground"
        >
          View all <ChevronRightIcon size={14} />
        </Link>
      </div>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <ReviewTable transactions={reviewTransactions} categories={categories} variant="dashboard" />
      </div>
    </div>
  );
}
