import {
  buildNanoCategorizePrompt,
  parseTransactionCategoryMap,
  type CategorizeTransactionRow,
} from "./categorize.shared";

export const BROWSER_AI_PROVIDER = "chrome-prompt-api";
export const BROWSER_AI_MODEL = "gemini-nano";

/** Tiny batches — Gemini Nano context windows are often only ~1–4k tokens. */
export const BROWSER_AI_BATCH_SIZE = 4;

type LanguageModelAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export type BrowserAiSession = {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
  contextWindow?: number;
  contextUsage?: number;
  inputQuota?: number;
  measureContextUsage?: (input: string) => Promise<number>;
  measureInputUsage?: (input: string) => Promise<number>;
};

type LanguageModelStatic = {
  availability: (options?: Record<string, unknown>) => Promise<LanguageModelAvailability>;
  create: (options?: {
    expectedInputs?: Array<{ type: string; languages?: string[] }>;
    expectedOutputs?: Array<{ type: string; languages?: string[] }>;
    monitor?: (m: EventTarget & { addEventListener: Function }) => void;
  }) => Promise<BrowserAiSession>;
};

function getLanguageModel(): LanguageModelStatic | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return candidate ?? null;
}

function isQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  return (
    name === "QuotaExceededError" ||
    /input is too large|quota.?exceeded|context.?overflow|too large/i.test(message)
  );
}

export async function getBrowserAiAvailability(): Promise<{
  supported: boolean;
  availability: LanguageModelAvailability | "unsupported";
  message?: string;
}> {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel?.availability) {
    return {
      supported: false,
      availability: "unsupported",
      message:
        "Chrome built-in AI (Prompt API) is not available in this browser. Use Chrome desktop with Gemini Nano enabled.",
    };
  }

  try {
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
    });
    if (availability === "unavailable") {
      return {
        supported: false,
        availability,
        message:
          "Chrome built-in AI is unavailable on this device (hardware/storage/OS requirements not met).",
      };
    }
    return { supported: true, availability };
  } catch (error) {
    return {
      supported: false,
      availability: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Must be called synchronously from a user gesture when the model still needs
 * to download (`downloadable` / `downloading`). Returns a promise for the session.
 */
export function beginBrowserAiSession(): Promise<BrowserAiSession> {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel) {
    return Promise.reject(new Error("Chrome built-in AI is not supported in this browser."));
  }

  return LanguageModel.create({
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(m) {
      m.addEventListener("downloadprogress", (event: Event) => {
        const progress = event as Event & { loaded?: number };
        if (typeof progress.loaded === "number") {
          console.info(
            `[browser-ai] model download ${Math.round(progress.loaded * 100)}%`,
          );
        }
      });
    },
  });
}

async function promptWithQuotaGuard(session: BrowserAiSession, prompt: string) {
  try {
    if (session.measureContextUsage && typeof session.contextWindow === "number") {
      const needed = await session.measureContextUsage(prompt);
      const remaining = session.contextWindow - (session.contextUsage ?? 0);
      console.info(
        `[categorize] context ${needed}/${session.contextWindow} (remaining ${remaining})`,
      );
    } else if (session.measureInputUsage && typeof session.inputQuota === "number") {
      const needed = await session.measureInputUsage(prompt);
      console.info(`[categorize] input usage ${needed}/${session.inputQuota}`);
    }
  } catch {
    // Measurement APIs are optional / version-dependent.
  }

  try {
    return await session.prompt(prompt);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error(
        "Chrome Gemini Nano context is too small for this prompt. Try categorizing fewer rows, or open Monai in the latest Chrome desktop.",
      );
    }
    throw error;
  }
}

async function categorizeBatchWithSession(
  session: BrowserAiSession,
  batch: CategorizeTransactionRow[],
  cats: Array<{ name: string }>,
) {
  const { prompt, categoryOptions } = buildNanoCategorizePrompt(batch, cats);
  console.info(
    [
      "[categorize] batch request",
      `  provider: ${BROWSER_AI_PROVIDER}`,
      `  model: ${BROWSER_AI_MODEL}`,
      `  categories: ${categoryOptions.length}`,
      `  transactionRows: ${batch.length}`,
      `  promptChars: ${prompt.length}`,
    ].join("\n"),
  );

  const raw = await promptWithQuotaGuard(session, prompt);
  if (
    /On-device model is not available in Chromium/i.test(raw) ||
    /this API is just echoing back the input/i.test(raw)
  ) {
    throw new Error(
      "This browser exposes a stub Prompt API without Gemini Nano. Open Monai in Google Chrome (desktop) with built-in AI enabled.",
    );
  }
  const byTransactionId = parseTransactionCategoryMap(raw);
  console.info(
    [
      "[categorize] batch response",
      `  provider: ${BROWSER_AI_PROVIDER}`,
      `  model: ${BROWSER_AI_MODEL}`,
      `  categorizedRows: ${byTransactionId.size}`,
      `  sample: ${JSON.stringify([...byTransactionId.entries()].slice(0, 3))}`,
    ].join("\n"),
  );
  return byTransactionId;
}

/**
 * Categorize in small Nano-friendly batches. Reuses the same session (context is
 * large enough for several short prompts). Never calls create() mid-flow — that
 * requires a user gesture and will hang.
 */
export async function categorizeTransactionsInBrowser(
  transactions: CategorizeTransactionRow[],
  cats: Array<{ name: string }>,
  session: BrowserAiSession,
): Promise<Array<{ transactionId: number; category: string }>> {
  const assignments = new Map<number, string>();

  for (let i = 0; i < transactions.length; i += BROWSER_AI_BATCH_SIZE) {
    const batch = transactions.slice(i, i + BROWSER_AI_BATCH_SIZE);

    let batchMap: Map<number, string>;
    try {
      batchMap = await categorizeBatchWithSession(session, batch, cats);
    } catch (error) {
      // Last-resort: single-tx prompts if even a tiny batch overflows.
      if (!isQuotaError(error) || batch.length === 1) throw error;
      batchMap = new Map();
      for (const tx of batch) {
        const one = await categorizeBatchWithSession(session, [tx], cats);
        for (const [id, category] of one) batchMap.set(id, category);
      }
    }

    for (const [transactionId, category] of batchMap) {
      assignments.set(transactionId, category);
    }
  }

  console.info(`[categorize] done browser assignments=${assignments.size}`);
  return [...assignments.entries()].map(([transactionId, category]) => ({
    transactionId,
    category,
  }));
}
