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
    <div className="flex flex-col gap-5 xl:min-h-0 xl:flex-1">
      <div className="grid shrink-0 grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <NetWorthCard
            hasAccounts={accounts.length > 0}
            netWorth={metrics.netWorth}
            totalAssets={metrics.totalAssets}
            totalDebts={metrics.totalDebts}
            chartData={metrics.netWorthChartData}
          />
        </div>

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

      <div className="grid min-h-[24rem] grid-cols-1 items-stretch gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex h-full min-h-0 flex-col xl:col-span-2">
          <DashboardTransactionsCard transactions={transactions} categories={categories} />
        </div>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
          <TopCategoriesCard topGroups={metrics.topGroups} />
          <UpcomingPaymentsCard />
        </div>
      </div>
    </div>
  );
}
