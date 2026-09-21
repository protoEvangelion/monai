import { useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AI_CATEGORIZE_MAX_TRANSACTIONS } from "../../../server/plaid.sync.fns";
import {
  applyAICategorization,
  prepareAICategorization,
} from "../../../server/categorize.fns";
import {
  beginBrowserAiSession,
  categorizeTransactionsInBrowser,
  getBrowserAiAvailability,
} from "../../../lib/browserAiCategorize";
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
  const prepareAICategorizeFn = useServerFn(prepareAICategorization);
  const applyAICategorizeFn = useServerFn(applyAICategorization);
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

    // Start model create in the same turn as the click — Chrome requires a user
    // gesture when Gemini Nano still needs to download.
    const canStartSession =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== "undefined";
    const sessionPromise = canStartSession ? beginBrowserAiSession() : null;

    startAITransition(async () => {
      let session: Awaited<NonNullable<typeof sessionPromise>> | null = null;
      try {
        if (!sessionPromise) {
          showToast({
            title: "Chrome built-in AI required",
            description:
              "Open Monai in Chrome with Gemini Nano / Prompt API enabled.",
            tone: "danger",
          });
          return;
        }

        const availability = await getBrowserAiAvailability();
        if (!availability.supported && availability.availability === "unavailable") {
          showToast({
            title: "Chrome built-in AI unavailable",
            description: availability.message,
            tone: "danger",
          });
          return;
        }

        if (
          availability.availability === "downloadable" ||
          availability.availability === "downloading"
        ) {
          showToast({
            title: "Downloading on-device model…",
            description:
              "Chrome is fetching Gemini Nano. Keep this tab open — first download can take a few minutes.",
          });
        }

        session = await sessionPromise;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = await (prepareAICategorizeFn as any)({
          data: {
            ids: idsToCategorize,
            limit: AI_CATEGORIZE_MAX_TRANSACTIONS,
          },
        });

        if (!payload?.transactions?.length) {
          resetSelection();
          await router.invalidate();
          showToast({
            title: "Nothing left to categorize",
            description:
              payload?.skippedByRulesOrType > 0
                ? "Selected rows were already handled by rules or marked as income/transfer."
                : "No matching transactions.",
          });
          return;
        }

        const assignments = await categorizeTransactionsInBrowser(
          payload.transactions,
          payload.categories,
          session,
        );

        // Free the model before server apply — destroy() can stall and would
        // otherwise keep the UI transition pending forever.
        try {
          session.destroy?.();
        } catch {
          // ignore
        }
        session = null;

        console.info("[categorize] applying assignments", assignments.length);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyPromise = (applyAICategorizeFn as any)({
          data: { assignments },
        }) as Promise<{
          updatedCount?: number;
          skippedCount?: number;
          skipReasons?: string[];
        }>;
        const result = await Promise.race([
          applyPromise,
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error("Saving categories timed out. Try again.")),
              20_000,
            ),
          ),
        ]);
        console.info("[categorize] apply result", result);

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
                : "Used Chrome on-device Gemini Nano (no Cursor usage).",
          });
        }

        resetSelection();
        void router.invalidate();
      } catch (error) {
        const message = getErrorMessage(error);
        const needsGesture =
          /user gesture|NotAllowedError|downloadable|downloading/i.test(message);
        showToast({
          title: "AI categorization failed",
          description: needsGesture
            ? "Chrome needs a fresh click to download Gemini Nano — try AI Categorize again."
            : message,
          tone: "danger",
        });
      } finally {
        try {
          session?.destroy?.();
        } catch {
          // ignore
        }
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
