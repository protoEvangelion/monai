import { Card, CardContent } from "@heroui/react";
import { CheckCircle2Icon, AlertTriangleIcon, InfoIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { centsToDollars } from "./categories.utils";
import { EditIncomeField } from "./EditIncomeField";

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

  const assignedPercent =
    expectedIncome > 0
      ? Math.min((totalBudget / expectedIncome) * 100, 100)
      : totalBudget > 0
        ? 100
        : 0;
  const remainingPercent =
    expectedIncome > 0 && !isOverAssigned
      ? Math.max(0, 100 - assignedPercent)
      : 0;
  const overPercent =
    expectedIncome > 0 && isOverAssigned
      ? Math.min((remainingToAssign / expectedIncome) * 100, 100)
      : totalBudget > 0 && isOverAssigned
        ? 100
        : 0;

  const realityBalanceRaw = actualIncome - totalSpent;
  const realityBalance =
    Math.abs(realityBalanceRaw) < 0.005 ? 0 : realityBalanceRaw;
  const realityVariance = Math.abs(realityBalance);
  const isRealityDeficit = realityBalance < 0;
  const spentPercent =
    actualIncome > 0
      ? Math.min((totalSpent / actualIncome) * 100, 100)
      : totalSpent > 0
        ? 100
        : 0;
  const surplusPercent =
    actualIncome > 0 && !isRealityDeficit ? Math.max(0, 100 - spentPercent) : 0;
  const deficitPercent =
    actualIncome > 0 && isRealityDeficit
      ? Math.min((realityVariance / actualIncome) * 100, 100)
      : totalSpent > 0 && isRealityDeficit
        ? 100
        : 0;

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

            {/* Right column: Plan + Reality bars */}
            <div className="min-w-0 grid gap-4">
              {/* Plan bar */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
                    Plan
                  </p>
                  <span
                    className={`text-xs font-semibold ${isBalanced ? "text-success" : isOverAssigned ? "text-danger" : "text-warning"}`}
                  >
                    {isOverAssigned ? "+" : ""}
                    {formatCurrency(remainingToAssign, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    {isOverAssigned ? "over" : "remaining"}
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full border border-divider/40 bg-default-100 shadow-inner">
                  <div className="flex h-full w-full">
                    <div
                      className="h-full bg-success"
                      style={{ width: `${assignedPercent}%` }}
                    />
                    {remainingPercent > 0 ? (
                      <div
                        className="h-full bg-warning/35"
                        style={{ width: `${remainingPercent}%` }}
                      />
                    ) : null}
                  </div>
                </div>
                {overPercent > 0 ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-danger/10">
                    <div
                      className="h-full rounded-full bg-danger"
                      style={{ width: `${overPercent}%` }}
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-default-400">
                  <span>
                    Expected{" "}
                    {formatCurrency(expectedIncome, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span>
                    Budgeted{" "}
                    {formatCurrency(totalBudget, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Reality bar */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
                    Reality
                  </p>
                  <span
                    className={`text-xs font-semibold ${isRealityDeficit ? "text-danger" : "text-success"}`}
                  >
                    {formatCurrency(realityVariance, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    {isRealityDeficit ? "deficit" : "surplus"}
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full border border-divider/40 bg-default-100 shadow-inner">
                  <div className="flex h-full w-full">
                    <div
                      className={
                        isRealityDeficit
                          ? "h-full bg-danger"
                          : "h-full bg-[#0ea5e9]"
                      }
                      style={{ width: `${spentPercent}%` }}
                    />
                    {surplusPercent > 0 ? (
                      <div
                        className="h-full bg-success/25"
                        style={{ width: `${surplusPercent}%` }}
                      />
                    ) : null}
                  </div>
                </div>
                {deficitPercent > 0 ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-danger/10">
                    <div
                      className="h-full rounded-full bg-danger"
                      style={{ width: `${deficitPercent}%` }}
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-default-400">
                  <span>
                    Received{" "}
                    {formatCurrency(actualIncome, { maximumFractionDigits: 0 })}
                  </span>
                  <span>
                    Spent{" "}
                    {formatCurrency(totalSpent, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
