import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { updateMonthlyAllocation } from "../../../server/budget.fns";

export function MonthlyBudgetInput({
  categoryId,
  month,
  value,
  onSaved,
}: {
  categoryId: number;
  month: string;
  value: number;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(String(value || ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(value || ""));
  }, [value]);

  const save = async () => {
    const amount = Math.max(0, Number(draft) || 0);
    if (amount === value) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateMonthlyAllocation as any)({
        data: { month, categoryId, amount },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
      <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">
        Budgeted
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs font-bold text-default-400">$</span>
        <input
          aria-label="Monthly budget"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              save();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
          placeholder="0"
        />
        {saving ? (
          <Loader2Icon size={14} className="animate-spin text-default-400" />
        ) : null}
      </div>
    </div>
  );
}
