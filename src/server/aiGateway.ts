import { streamText } from "ai";
import {
  buildCategorizePrompt,
  parseTransactionCategoryMap,
  type CategorizeTransactionRow,
} from "../lib/categorize.shared";

/** Live AI Gateway slug. Override with `AI_CATEGORIZE_MODEL`. */
export const DEFAULT_AI_CATEGORIZE_MODEL = "deepseek/deepseek-v4.1-flash";
export const AI_GATEWAY_PROVIDER = "vercel-ai-gateway";
export const GATEWAY_BATCH_SIZE = 40;
export const GATEWAY_TIMEOUT_MS = 55_000;
export const GATEWAY_MAX_OUTPUT_TOKENS = 2_000;

export const GATEWAY_AUTH_ERROR_MESSAGE =
  "AI Gateway is not authenticated. Set AI_GATEWAY_API_KEY in .env.local for local/CI, or enable AI Gateway on the Vercel project so VERCEL_OIDC_TOKEN is injected. Do not put the key in VITE_* client env.";

export function resolveCategorizeModel(env: NodeJS.ProcessEnv = process.env) {
  const override = env.AI_CATEGORIZE_MODEL?.trim();
  return override || DEFAULT_AI_CATEGORIZE_MODEL;
}

export function isGatewayAuthenticationError(error: unknown) {
  if (error == null) return false;

  const name =
    error instanceof Error
      ? error.name
      : typeof error === "object" && "name" in error
        ? String(error.name)
        : "";
  const message = error instanceof Error ? error.message : String(error);
  const type =
    typeof error === "object" && error && "type" in error
      ? String((error as { type?: unknown }).type)
      : "";
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;

  return (
    name === "GatewayAuthenticationError" ||
    type === "authentication_error" ||
    statusCode === 401 ||
    (name === "GatewayError" &&
      /unauthenticated|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN/i.test(message)) ||
    /AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|Unauthenticated request to AI Gateway/i.test(message)
  );
}

export function mapGatewayError(error: unknown): never {
  if (isGatewayAuthenticationError(error)) {
    throw new Error(GATEWAY_AUTH_ERROR_MESSAGE);
  }
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

export async function categorizeTransactionsViaGateway(
  transactions: CategorizeTransactionRow[],
  cats: Array<{ name: string }>,
) {
  const model = resolveCategorizeModel();
  const assignments = new Map<number, string>();

  for (let i = 0; i < transactions.length; i += GATEWAY_BATCH_SIZE) {
    const batch = transactions.slice(i, i + GATEWAY_BATCH_SIZE);
    const { prompt, categoryOptions } = buildCategorizePrompt(batch, cats);
    console.info(
      [
        "[categorize] gateway batch request",
        `  provider: ${AI_GATEWAY_PROVIDER}`,
        `  model: ${model}`,
        `  categories: ${categoryOptions.length}`,
        `  transactionRows: ${batch.length}`,
        `  promptChars: ${prompt.length}`,
      ].join("\n"),
    );

    let raw: string;
    // Auth failures often land in onError, then result.text throws NoOutputGeneratedError.
    let streamError: unknown;
    try {
      const result = streamText({
        model,
        prompt,
        // DeepSeek V4.1 Flash can return thinking with no answer if reasoning is "none".
        reasoning: "low",
        maxOutputTokens: GATEWAY_MAX_OUTPUT_TOKENS,
        timeout: GATEWAY_TIMEOUT_MS,
        onError({ error }) {
          streamError = error;
        },
      });
      raw = await result.text;
    } catch (error) {
      mapGatewayError(streamError ?? error);
    }

    const batchMap = parseTransactionCategoryMap(raw);
    console.info(
      [
        "[categorize] gateway batch response",
        `  provider: ${AI_GATEWAY_PROVIDER}`,
        `  model: ${model}`,
        `  categorizedRows: ${batchMap.size}`,
        `  sample: ${JSON.stringify([...batchMap.entries()].slice(0, 3))}`,
      ].join("\n"),
    );
    for (const [transactionId, category] of batchMap) {
      assignments.set(transactionId, category);
    }
  }

  console.info(`[categorize] done gateway assignments=${assignments.size} model=${model}`);
  return [...assignments.entries()].map(([transactionId, category]) => ({
    transactionId,
    category,
  }));
}
