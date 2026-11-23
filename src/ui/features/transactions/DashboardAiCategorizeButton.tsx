import { Tooltip } from "@mantine/core";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { isCatchAllCategory } from "../../../lib/categorize.shared";
import { useTransactionReviewActions } from "./transactions.actions";
import type { Tx } from "./transactions.types";

function isUncategorizedReviewTx(tx: Tx) {
  if (tx.isReviewed) return false;
  if (tx.transactionType !== "regular") return false;
  // Already annotated (by you or the Amazon matcher) — don't overwrite it.
  if (tx.note?.trim()) return false;
  if (tx.categoryId == null) return true;
  return tx.category?.name ? isCatchAllCategory(tx.category.name) : false;
}

const TOOLTIP =
  "Categorize every unreviewed, uncategorized transaction currently loaded (rows with a note are skipped)";

/** Renders in the MRT top toolbar (same row as Show/Hide filters). */
export function DashboardAiCategorizeButton({ transactions }: { transactions: Tx[] }) {
  const [, setRowSelection] = useState<Record<string, boolean>>({});
  const [, setSelectAllPages] = useState(false);

  const aiEligibleIds = useMemo(
    () => transactions.filter(isUncategorizedReviewTx).map((tx) => tx.id),
    [transactions],
  );

  const { handleAICategorize, isAICategorizing } = useTransactionReviewActions({
    actionIds: aiEligibleIds,
    aiTransactionCount: aiEligibleIds.length,
    setRowSelection,
    setSelectAllPages,
  });

  return (
    <Tooltip label={TOOLTIP} withArrow openDelay={200} position="bottom" withinPortal>
      <button
        type="button"
        aria-label="AI Categorize"
        disabled={isAICategorizing || aiEligibleIds.length === 0}
        onClick={handleAICategorize}
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold tracking-wide text-white transition-all duration-200",
          "bg-linear-to-br from-teal-700 via-blue-700 to-indigo-700 shadow-md shadow-blue-900/20",
          "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30 active:translate-y-0",
          "disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none disabled:shadow-none",
        ].join(" ")}
      >
        {isAICategorizing ? (
          <Loader2Icon size={13} className="animate-spin" />
        ) : (
          <SparklesIcon size={13} />
        )}
        AI Categorize
        {aiEligibleIds.length > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-white/30 bg-white/95 px-1 text-[11px] font-black tabular-nums text-blue-700">
            {aiEligibleIds.length}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
