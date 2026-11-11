import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";

/**
 * Vercel AI Gateway provider for server-side categorization.
 *
 * The Gateway exposes an OpenAI-compatible endpoint, so the TanStack AI
 * OpenAI-compatible adapter works unchanged. Model ids are Gateway ids
 * (`vendor/model`) so switching providers is a one-line change.
 *
 * Auth: `AI_GATEWAY_API_KEY` (Vercel OIDC also works in deployments, but an
 * explicit key keeps local and production behaving the same).
 */
export const GATEWAY_BASE_URL =
  process.env.AI_GATEWAY_BASE_URL?.trim() || "https://ai-gateway.vercel.sh/v1";

export const GATEWAY_MODEL =
  process.env.AI_GATEWAY_MODEL?.trim() || "openai/gpt-5.1";

export const GATEWAY_PROVIDER_LABEL = "vercel-ai-gateway";

export class GatewayUnavailableError extends Error {
  constructor(message = "AI Gateway is not configured.") {
    super(message);
    this.name = "GatewayUnavailableError";
  }
}

export function gatewayApiKey() {
  const key =
    process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!key) {
    throw new GatewayUnavailableError(
      "Missing AI_GATEWAY_API_KEY. Add it to .env.local (local) and to Vercel (production/preview).",
    );
  }
  return key;
}

/** Seconds the local server should hold the request open while the model answers. */
export function gatewayTimeoutSeconds() {
  const timeoutMs = Number(process.env.AI_GATEWAY_TIMEOUT_MS ?? 90_000);
  const seconds = Math.ceil((Number.isFinite(timeoutMs) ? timeoutMs : 90_000) / 1000);
  return Math.min(255, seconds + 15);
}

/**
 * One prompt in, one text out. `threadId` is only used to tag the run for
 * TanStack AI's event client, so any stable string works here.
 */
export async function runGatewayPrompt({
  prompt,
  threadId = `monai-${Date.now()}`,
}: {
  prompt: string;
  threadId?: string;
}): Promise<string> {
  const adapter = openaiCompatibleText(GATEWAY_MODEL, {
    baseURL: GATEWAY_BASE_URL,
    apiKey: gatewayApiKey(),
  });

  const result = await chat({
    adapter,
    threadId,
    messages: [{ role: "user", content: prompt }],
    // Non-streaming: we only need the finished JSON envelope.
    stream: false,
  });

  const text = "text" in result ? result.text : "";
  if (!text.trim()) {
    throw new Error("AI Gateway returned an empty response.");
  }
  return text;
}
