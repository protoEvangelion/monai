import { useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AI_CATEGORIZE_MAX_TRANSACTIONS } from "../../../server/plaid.sync.fns";
import { runAICategorization } from "../../../server/categorize.fns";
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
  const runAICategorizeFn = useServerFn(runAICategorization);
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

  const handleAICategorize = () => {
    if (!actionIds.length) return;
    const idsToCategorize = actionIds.slice(0, AI_CATEGORIZE_MAX_TRANSACTIONS);

    startAITransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (await (runAICategorizeFn as any)({
          data: {
            ids: idsToCategorize,
            limit: AI_CATEGORIZE_MAX_TRANSACTIONS,
          },
        })) as {
          requestedCount?: number;
          updatedCount?: number;
          skippedCount?: number;
          skipReasons?: string[];
        };

        if ((result?.updatedCount ?? 0) === 0 && (result?.requestedCount ?? 0) === 0) {
          resetSelection();
          await router.invalidate();
          showToast({
            title: "Nothing left to categorize",
            description:
              Array.isArray(result?.skipReasons) && result.skipReasons.length
                ? result.skipReasons[0]
                : "No matching transactions.",
          });
          return;
        }

        if ((result?.updatedCount ?? 0) === 0) {
          const reason =
            Array.isArray(result?.skipReasons) && result.skipReasons.length
              ? result.skipReasons.slice(0, 3).join("; ")
              : "No matching categories were applied.";
          showToast({
            title: "Nothing was categorized",
            description: reason,
            tone: "danger",
          });
        } else {
          showToast({
            title: `Categorized ${result.updatedCount} transactions`,
            description:
              actionIds.length > AI_CATEGORIZE_MAX_TRANSACTIONS
                ? "Run AI Categorize again to continue through the remaining transactions."
                : "Used Vercel AI Gateway.",
          });
        }

        resetSelection();
        void router.invalidate();
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
