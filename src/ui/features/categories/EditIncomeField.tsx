import { Button } from "@heroui/react";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { CurrencyNumberInput } from "../../shared/CurrencyNumberInput";

export function EditIncomeField({
  incomeInput,
  incomeChanged,
  savingIncome,
  onIncomeInputChange,
  onSaveIncome,
}: {
  incomeInput: string;
  incomeChanged: boolean;
  savingIncome: boolean;
  onIncomeInputChange: (value: string) => void;
  onSaveIncome: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-accent)_12%,transparent)] md:w-1/2">
      <label className="min-w-0 flex-1 cursor-text">
        <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-default-500">
          <PencilIcon size={10} />
          Edit income
        </span>
        <span className="flex items-center gap-2 rounded-lg border border-divider/60 bg-background px-2.5 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="text-base font-black text-default-400">$</span>
          <CurrencyNumberInput
            ariaLabel="Expected monthly income"
            value={incomeInput}
            onChange={onIncomeInputChange}
            onEnter={onSaveIncome}
            className="min-w-0 flex-1 bg-transparent text-lg font-black tracking-tight text-foreground outline-none"
          />
        </span>
        {incomeChanged ? (
          <span className="mt-1 block text-[10px] font-semibold text-primary">
            Unsaved change
          </span>
        ) : null}
      </label>
      {incomeChanged ? (
        <Button
          size="sm"
          variant="primary"
          className="shrink-0 rounded-lg px-3"
          onPress={onSaveIncome}
          isDisabled={savingIncome}
        >
          {savingIncome ? (
            <Loader2Icon size={14} className="animate-spin" />
          ) : null}
          Save
        </Button>
      ) : null}
    </div>
  );
}
