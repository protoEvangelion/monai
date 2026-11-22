import { useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AI_CATEGORIZE_MAX_TRANSACTIONS } from "../../../server/plaid.sync.fns";
import { runPiAICategorization } from "../../../server/categorize.fns";
import {
  setTransactionsReviewed,
  setTransactionsType,
  splitTransaction,
  updateTransactionsCategory,
  updateTransactionsDate,
} from "../../../server/transactions.fns";
import { showToast } from "../../shared/toast";
import { getErrorMessage } from "./transactions.utils";

export function useTransactionReviewActions({
  actionIds,
  aiTransactionCount: _aiTransactionCount,
  setRowSelection,
  setSelectAllPages,
}: {
  actionIds: number[];
  aiTransactionCount: number;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectAllPages: Dispatch<SetStateAction<boolean>>;
}) {
  const router = useRouter();
  const runPiAICategorizeFn = useServerFn(runPiAICategorization);
  const [isAICategorizing, startAITransition] = useTransition();
  const [isSplitting, startSplitTransition] = useTransition();

  const resetSelection = () => {
    setRowSelection({});
    setSelectAllPages(false);
  };

  const handleSetReviewed = async (ids: number[], isReviewed: boolean) => {
    if (!ids.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (setTransactionsReviewed as any)({ data: { ids, isReviewed } });
    resetSelection();
    await router.invalidate();
  };

  /** One-shot server categorizer (AI Gateway, or the local CLI if configured). */
  const runServerCategorize = async (ids: number[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (await (runPiAICategorizeFn as any)({
      data: { ids, limit: AI_CATEGORIZE_MAX_TRANSACTIONS },
    })) as {
      updatedCount?: number;
      skippedCount?: number;
      skipReasons?: string[];
      provider?: string;
    };

  const reportServerResult = (result: {
    updatedCount?: number;
    skippedCount?: number;
    skipReasons?: string[];
    provider?: string;
  }) => {
    if ((result?.updatedCount ?? 0) === 0) {
      const reason =
        Array.isArray(result?.skipReasons) && result.skipReasons.length
          ? result.skipReasons.slice(0, 3).join("; ")
          : "No matching categories were applied.";
      showToast({ title: "Nothing was categorized", description: reason, tone: "danger" });
      return;
    }

    showToast({
      title: `Categorized ${result.updatedCount} transactions`,
      description:
        (result.skippedCount ?? 0) > 0
          ? `${result.skippedCount} skipped (already noted, rule-matched, or not an expense).`
          : result.provider === "vercel-ai-gateway"
            ? "Used Vercel AI Gateway."
            : "Used the pi CLI on this machine.",
    });
  };

  const handleAICategorize = () => {
    if (!actionIds.length) return;
    // Walk every eligible row currently loaded, not just the first batch. Each
    // request stays capped so the prompt and the server timeout stay sane; we
    // just chain the batches until the whole view is done in one click.
    const batches: number[][] = [];
    for (let i = 0; i < actionIds.length; i += AI_CATEGORIZE_MAX_TRANSACTIONS) {
      batches.push(actionIds.slice(i, i + AI_CATEGORIZE_MAX_TRANSACTIONS));
    }

    startAITransition(async () => {
      try {
        let updatedCount = 0;
        let skippedCount = 0;
        let provider: string | undefined;
        const skipReasons: string[] = [];

        for (const batch of batches) {
          const result = await runServerCategorize(batch);
          updatedCount += result.updatedCount ?? 0;
          skippedCount += result.skippedCount ?? 0;
          if (result.provider) provider = result.provider;
          if (Array.isArray(result.skipReasons)) skipReasons.push(...result.skipReasons);
        }

        await router.invalidate();
        reportServerResult({ updatedCount, skippedCount, skipReasons, provider });
        resetSelection();

        return;
      } catch (error) {
        showToast({
          title: "AI categorization failed",
          description: getErrorMessage(error),
          tone: "danger",
        });
      }
    });
  };

  const handleSetCategory = async (ids: number[], categoryId: number | null) => {
    if (!ids.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateTransactionsCategory as any)({ data: { ids, categoryId } });
    await router.invalidate();
  };

  const handleSetTransactionType = async (
    ids: number[],
    transactionType: "regular" | "income" | "transfer",
  ) => {
    if (!ids.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (setTransactionsType as any)({ data: { ids, transactionType } });
    await router.invalidate();
  };

  const handleSetDate = async (ids: number[], date: string) => {
    if (!ids.length || !date) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateTransactionsDate as any)({ data: { ids, date } });
    resetSelection();
    await router.invalidate();
  };

  const handleSplitTransaction = (
    id: number,
    splits: Array<{ amount: number; categoryId: number }>,
  ) =>
    new Promise<void>((resolve, reject) => {
      startSplitTransition(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (splitTransaction as any)({ data: { id, splits } });
          resetSelection();
          await router.invalidate();
          showToast({
            title: "Transaction split",
            description: `Created ${splits.length} legs`,
          });
          resolve();
        } catch (error) {
          showToast({
            title: "Split failed",
            description: getErrorMessage(error),
            tone: "danger",
          });
          reject(error);
        }
      });
    });

  return {
    handleAICategorize,
    handleSetCategory,
    handleSetDate,
    handleSetReviewed,
    handleSetTransactionType,
    handleSplitTransaction,
    isAICategorizing,
    isSplitting,
    resetSelection,
  };
}
