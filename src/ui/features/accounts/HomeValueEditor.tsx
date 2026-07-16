import { useEffect, useState, useTransition } from "react";
import { formatCurrency } from "../../../lib/format";

export function HomeValueEditor({
  name,
  value,
  onSave,
}: {
  name: string;
  value: number;
  onSave: (input: { name: string; value: number }) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftValue, setDraftValue] = useState(String(value));
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setDraftName(name);
    setDraftValue(String(value));
  }, [name, value]);

  const parsedValue = Math.max(0, Number(draftValue) || 0);
  const hasChanges =
    draftName.trim() !== name.trim() || Math.abs(parsedValue - value) > 0.005;

  const handleSave = () => {
    if (!hasChanges || isSaving) return;
    startSaving(async () => {
      await onSave({
        name: draftName.trim() || "Home",
        value: parsedValue,
      });
    });
  };

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-divider/50 bg-default-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-default-400">
        Manual estimate
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Name</span>
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          className="rounded-lg border border-divider bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Value</span>
        <input
          type="number"
          min="0"
          step="1000"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          className="rounded-lg border border-divider bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-default-400">{formatCurrency(parsedValue)}</span>
        <button
          type="button"
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
