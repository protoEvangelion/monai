export function BudgetProgress({
  spent,
  budget,
}: {
  spent: number;
  budget: number;
}) {
  const isZeroBudgetOver = budget <= 0 && spent > 0;
  const rawPercent = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
  const clampedPercent = Math.max(0, Math.min(rawPercent, 100));
  const fillClass =
    isZeroBudgetOver || rawPercent > 100
      ? "bg-danger"
      : rawPercent >= 50
        ? "bg-warning"
        : "bg-success";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-default-400/60 bg-default-300/90 shadow-inner">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${fillClass}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}
