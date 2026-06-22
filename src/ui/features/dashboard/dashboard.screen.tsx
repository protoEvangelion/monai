import { useTimeTravel } from "../../hooks/useTimeTravel";
import { BudgetSummaryCard } from "./BudgetSummaryCard";
import { DashboardTransactionsCard } from "./DashboardTransactionsCard";
import { useDashboardMetrics } from "./dashboard.hooks";
import type {
  DashboardAccountsData,
  DashboardBudgetsData,
  DashboardCategoriesData,
  DashboardNetWorthData,
  DashboardTransactionsData,
} from "./dashboard.types";
import { NetWorthCard } from "./NetWorthCard";
import { TopCategoriesCard } from "./TopCategoriesCard";
import { UpcomingPaymentsCard } from "./UpcomingPaymentsCard";

export function DashboardScreen({
  categories,
  transactions,
  accounts,
  netWorthHistory,
  budgets,
}: {
  categories: DashboardCategoriesData;
  transactions: DashboardTransactionsData;
  accounts: DashboardAccountsData;
  netWorthHistory: DashboardNetWorthData;
  budgets: DashboardBudgetsData;
}) {
  const { viewDate } = useTimeTravel();
  const metrics = useDashboardMetrics({
    categories,
    transactions,
    accounts,
    netWorthHistory,
    budgets,
    viewDate,
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
      <div className="xl:col-span-2 h-full self-stretch">
        <NetWorthCard
          hasAccounts={accounts.length > 0}
          netWorth={metrics.netWorth}
          totalAssets={metrics.totalAssets}
          totalDebts={metrics.totalDebts}
          chartData={metrics.netWorthChartData}
        />
      </div>

      <div className="h-full self-stretch">
        <BudgetSummaryCard
          totalBudgeted={metrics.totalBudgeted}
          totalSpent={metrics.totalSpent}
          totalLeft={metrics.totalLeft}
          expectedIncome={metrics.expectedIncome}
          actualIncome={metrics.actualIncome}
          remainingToAssignCents={metrics.remainingToAssignCents}
          isZeroBasedBalanced={metrics.isZeroBasedBalanced}
          overBudget={metrics.overBudget}
        />
      </div>

      <div className="xl:col-span-2 h-full self-stretch">
        <DashboardTransactionsCard transactions={transactions} categories={categories} />
      </div>

      <div className="h-full self-stretch">
        <TopCategoriesCard topGroups={metrics.topGroups} />
      </div>

      <div className="hidden xl:block xl:col-span-2" aria-hidden />

      <div>
        <UpcomingPaymentsCard />
      </div>
    </div>
  );
}
