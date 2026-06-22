import { useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AI_CATEGORIZE_MAX_TRANSACTIONS,
  runAICategorization,
} from "../../../server/plaid.sync.fns";
import {
  setTransactionsReviewed,
  setTransactionsType,
  updateTransactionsCategory,
  updateTransactionsDate,
} from "../../../server/transactions.fns";
import { showToast } from "../../shared/toast";
import { getErrorMessage } from "./transactions.utils";

export function useTransactionReviewActions({
  actionIds,
  aiTransactionCount,
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
        const result = await (runAICategorizeFn as any)({
          data: {
            ids: idsToCategorize,
            limit: AI_CATEGORIZE_MAX_TRANSACTIONS,
          },
        });
        resetSelection();
        await router.invalidate();
        if (actionIds.length > AI_CATEGORIZE_MAX_TRANSACTIONS) {
          showToast({
            title: `Categorized ${result?.updatedCount ?? aiTransactionCount} transactions`,
            description: "Run AI Categorize again to continue through the remaining transactions.",
          });
        }
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

  return {
    handleAICategorize,
    handleSetCategory,
    handleSetDate,
    handleSetReviewed,
    handleSetTransactionType,
    isAICategorizing,
    resetSelection,
  };
}
