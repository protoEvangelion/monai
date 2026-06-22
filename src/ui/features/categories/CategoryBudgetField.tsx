import { formatCurrency } from "../../../lib/format";

export function CategoryBudgetField({
  budget,
  numericBudget,
  onBudgetChange,
  sliderMax,
}: {
  budget: string;
  numericBudget: number;
  onBudgetChange: (value: string) => void;
  sliderMax: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-default-400 font-medium">
        Default Budget <span className="text-default-300">(optional)</span>
      </label>
      <div className="rounded-2xl border border-divider/50 bg-default-50/70 px-3 py-3">
        <input
          aria-label="Monthly budget slider"
          type="range"
          min={0}
          max={sliderMax}
          step={25}
          value={numericBudget}
          onChange={(event) => onBudgetChange(event.target.value)}
          className="budget-slider mb-3 w-full cursor-pointer"
        />
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-default-400">
          <span>{formatCurrency(0)}</span>
          <span className="rounded-md bg-default-100 px-2 py-0.5 text-default-600">
            {formatCurrency(numericBudget)}
          </span>
          <span>{formatCurrency(sliderMax)}</span>
        </div>
        <div className="flex justify-center">
          <input
            aria-label="Monthly budget"
            type="number"
            min="0"
            step="1"
            value={budget}
            onChange={(event) => onBudgetChange(event.target.value)}
            placeholder="0"
            className="w-40 rounded-xl border border-default-200 bg-default-100 px-3 py-2 text-center text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
}
