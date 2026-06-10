import { Card, CardContent } from "@heroui/react";
import { CheckCircle2Icon, AlertTriangleIcon, InfoIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { centsToDollars } from "./categories.utils";
import { EditIncomeField } from "./EditIncomeField";

function BulletMetric({
  title,
  actualLabel,
  targetLabel,
  actual,
  target,
  variant,
}: {
  title: string;
  actualLabel: string;
  targetLabel: string;
  actual: number;
  target: number;
  variant: "income" | "spending";
}) {
  const maxValue = Math.max(actual, target, 1);
  const fillPercent = Math.min(100, (actual / maxValue) * 100);
  const targetPercent = Math.min(100, (target / maxValue) * 100);
  const delta = variant === "income" ? actual - target : target - actual;
  const isComplete = Math.abs(delta) < 0.005;
  const isBad = variant === "spending" && delta < 0;
  const isWarning = variant === "income" && delta < 0;
  const fillClass =
    variant === "income"
      ? actual >= target && target > 0
        ? "bg-success"
        : "bg-[#0ea5e9]"
      : actual > target && target > 0
        ? "bg-danger"
        : "bg-success";
  const deltaLabel = isComplete
    ? variant === "income"
      ? "on plan"
      : "on budget"
    : variant === "income"
      ? delta > 0
        ? `${formatCurrency(delta, { maximumFractionDigits: 0 })} over plan`
        : `${formatCurrency(Math.abs(delta), { maximumFractionDigits: 0 })} remaining`
      : isBad
        ? `${formatCurrency(Math.abs(delta), { maximumFractionDigits: 0 })} over`
        : `${formatCurrency(delta, { maximumFractionDigits: 0 })} left`;
  const actualCompactLabel = `${variant === "income" ? "Recv" : "Spent"} ${formatCurrency(actual, { maximumFractionDigits: 0 })}`;
  const targetCompactLabel = `${variant === "income" ? "Plan" : "Budget"} ${formatCurrency(target, { maximumFractionDigits: 0 })}`;
  const deltaCompactLabel = isComplete
    ? variant === "income"
      ? "on plan"
      : "on budget"
    : variant === "income"
      ? delta > 0
        ? `${formatCurrency(delta, { maximumFractionDigits: 0 })} over`
        : `${formatCurrency(Math.abs(delta), { maximumFractionDigits: 0 })} rem`
      : isBad
        ? `${formatCurrency(Math.abs(delta), { maximumFractionDigits: 0 })} over`
        : `${formatCurrency(delta, { maximumFractionDigits: 0 })} left`;

  return (
    <div className="rounded-xl border border-divider/50 bg-background/55 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
        {title}
      </p>

      <div
        aria-label={`${title}: ${actualLabel}, ${targetLabel}`}
        className="relative h-5 overflow-hidden rounded-full border border-divider/50 bg-default-100 shadow-inner"
      >
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${fillPercent}%` }}
        />
        <div
          className="absolute top-[-2px] h-7 w-0.5 rounded-full bg-foreground shadow-sm"
          style={{ left: `calc(${targetPercent}% - 1px)` }}
        />
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-default-400 sm:gap-3">
        <span className="truncate text-left">
          <span className="sm:hidden">{actualCompactLabel}</span>
          <span className="hidden sm:inline">{actualLabel}</span>
        </span>
        <span
          className={`shrink-0 text-center text-[11px] font-bold sm:text-xs ${
            isComplete
              ? "text-success"
              : isBad
                ? "text-danger"
                : isWarning
                  ? "text-warning"
                  : "text-success"
          }`}
        >
          <span className="sm:hidden">{deltaCompactLabel}</span>
          <span className="hidden sm:inline">{deltaLabel}</span>
        </span>
        <span className="truncate text-right">
          <span className="sm:hidden">{targetCompactLabel}</span>
          <span className="hidden sm:inline">{targetLabel}</span>
        </span>
      </div>
    </div>
  );
}

export function CategoryTopCard({
  expectedIncome,
  actualIncome,
  totalSpent,
  totalBudget,
  remainingToAssignCents,
  incomeInput,
  savingIncome,
  onIncomeInputChange,
  onSaveIncome,
}: {
  expectedIncome: number;
  actualIncome: number;
  totalSpent: number;
  totalBudget: number;
  remainingToAssignCents: number;
  incomeInput: string;
  savingIncome: boolean;
  onIncomeInputChange: (value: string) => void;
  onSaveIncome: () => void;
}) {
  const isBalanced = remainingToAssignCents === 0 && expectedIncome > 0;
  const isOverAssigned = remainingToAssignCents < 0;
  const remainingToAssign = centsToDollars(Math.abs(remainingToAssignCents));
  const incomeChanged =
    Math.max(0, Number(incomeInput) || 0) !== expectedIncome;

  const realityBalanceRaw = actualIncome - totalSpent;
  const realityBalance =
    Math.abs(realityBalanceRaw) < 0.005 ? 0 : realityBalanceRaw;

  const statusLabel = isBalanced
    ? "Balanced"
    : isOverAssigned
      ? `${formatCurrency(remainingToAssign, { maximumFractionDigits: 0 })} overassigned`
      : `${formatCurrency(remainingToAssign, { maximumFractionDigits: 0 })} left to assign`;
  const statusDetail = isBalanced
    ? "Every dollar assigned"
    : isOverAssigned
      ? "Reduce allocations"
      : "Assign remaining income";

  return (
    <Card className="border border-divider/60 bg-content1 shadow-none">
      <CardContent className="p-0">
        <div
          className={`relative border-l-4 ${
            isBalanced
              ? "border-l-success"
              : isOverAssigned
                ? "border-l-danger"
                : "border-l-warning"
          }`}
        >
          <div className="grid gap-4 px-4 py-4 md:grid-cols-2 md:items-start">
            {/* Left column: ZBB status + edit income */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    isBalanced
                      ? "bg-success-soft text-success"
                      : isOverAssigned
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                  }`}
                >
                  {isBalanced ? (
                    <CheckCircle2Icon size={22} />
                  ) : (
                    <AlertTriangleIcon size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-default-500">
                    <span>Zero-Based Budget</span>
                    <span className="group relative inline-flex">
                      <span
                        aria-label="About zero-based budgeting"
                        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-default-500 transition-colors hover:text-primary"
                      >
                        <InfoIcon size={11} />
                      </span>
                      <span className="pointer-events-none absolute left-0 top-5 z-20 w-80 rounded-xl border border-divider/60 bg-background p-3 normal-case tracking-normal text-default-700 opacity-0 shadow-xl ring-1 ring-black/5 transition-opacity duration-150 group-hover:opacity-100">
                        <span className="block text-sm font-bold text-foreground">
                          Why zero-based budgeting?
                        </span>
                        <span className="mt-1.5 block text-sm leading-5 text-default-500">
                          This view helps you give every expected income dollar
                          a job before the month starts, so the plan is
                          intentional instead of reactive.
                        </span>
                        <span className="mt-2 block text-sm">
                          See immediately whether income is fully assigned.
                        </span>
                        <span className="mt-1 block text-sm">
                          Catch overbudgeting before spending begins.
                        </span>
                        <span className="mt-1 block text-sm">
                          Separate the monthly plan from actual spending.
                        </span>
                      </span>
                    </span>
                  </div>
                  <p
                    className={`truncate text-xl font-black leading-tight ${
                      isBalanced
                        ? "text-success"
                        : isOverAssigned
                          ? "text-danger"
                          : "text-warning"
                    }`}
                  >
                    {statusLabel}
                  </p>
                  <p className="truncate text-xs text-default-500">
                    {statusDetail}
                  </p>
                </div>
              </div>

              <EditIncomeField
                incomeInput={incomeInput}
                incomeChanged={incomeChanged}
                savingIncome={savingIncome}
                onIncomeInputChange={onIncomeInputChange}
                onSaveIncome={onSaveIncome}
              />
            </div>

            <div className="min-w-0 grid gap-3">
              <BulletMetric
                title="Income"
                actualLabel={`Received ${formatCurrency(actualIncome, {
                  maximumFractionDigits: 0,
                })}`}
                targetLabel={`Planned ${formatCurrency(expectedIncome, {
                  maximumFractionDigits: 0,
                })}`}
                actual={actualIncome}
                target={expectedIncome}
                variant="income"
              />
              <BulletMetric
                title="Budget"
                actualLabel={`Spent ${formatCurrency(totalSpent, {
                  maximumFractionDigits: 0,
                })}`}
                targetLabel={`Budgeted ${formatCurrency(totalBudget, {
                  maximumFractionDigits: 0,
                })}`}
                actual={totalSpent}
                target={totalBudget}
                variant="spending"
              />
              <div className="flex items-center justify-between gap-3 rounded-xl bg-content2/55 px-3 py-2 text-xs font-semibold">
                <span className="text-default-500">Actual cash flow</span>
                <span
                  className={
                    realityBalance < 0 ? "text-danger" : "text-success"
                  }
                >
                  {formatCurrency(realityBalance, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
