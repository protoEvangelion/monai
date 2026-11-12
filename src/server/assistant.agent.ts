import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { StreamChunk } from "@tanstack/ai";
import { Type } from "typebox";

import { GATEWAY_BASE_URL, GATEWAY_MODEL, gatewayApiKey } from "../services/aiGateway";
import {
  accountOverviewQuery,
  monthlyTrendQuery,
  searchTransactionsQuery,
  spendingByCategoryQuery,
  topMerchantsQuery,
} from "./assistant.queries";

/**
 * The assistant's brain: a pi agent session, in-process.
 *
 * Why the SDK rather than the CLI: the chat needs a real run lifecycle
 * (abort, tool execution, compaction) and typed tools, not a subprocess that
 * prints text. The categorizer keeps the CLI because there the isolation of a
 * child process is the point.
 *
 * No persistence: every request builds a fresh in-memory session and replays
 * the transcript the browser sent. Nothing is written to disk, and the server
 * holds no state between requests — which is what makes it safe on Vercel,
 * where consecutive requests can land on different instances.
 */

const PROVIDER_ID = "monai-gateway";

/** Thinking level for chat. Extraction-heavy, so keep it cheap. */
const THINKING_LEVEL = (process.env.PI_CHAT_THINKING?.trim() || "minimal") as
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high";

const SYSTEM_PROMPT = `You are Monai's finance assistant. You answer questions about the signed-in user's own transactions, accounts, and categories.

Rules:
- Always use the tools to get numbers. Never invent amounts, merchants, or dates.
- Assume all accounts unless the user names one. Never ask which account.
- Only ask a clarifying question when the month or date range is genuinely missing.
- Tools already return positive dollars for both spending and income. Format money as $1,234.56.
- "Spending" means regular (non-income, non-transfer) transactions. Transfers between your own accounts are not spending.
- Keep answers short: a one-line takeaway, then at most 5 supporting bullets.
- Plain text only. No markdown bold, italics, tables, or headings — the panel renders text as-is.
- Never mention tool names, SQL, or internal ids unless the user asks for a transaction id.`;

/**
 * Isolated agent dir. pi would otherwise read `~/.pi/agent` — including the
 * user's `APPEND_SYSTEM.md`, which would inject personal instructions into
 * every answer.
 */
function agentDir() {
  return path.join(os.tmpdir(), "monai-assistant-agent");
}

function writeAgentDir() {
  const dir = agentDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const models = {
    $schema: "https://pi.dev/schemas/models.schema.json",
    providers: {
      [PROVIDER_ID]: {
        name: "Vercel AI Gateway",
        baseUrl: GATEWAY_BASE_URL,
        api: "openai-responses",
        // Resolved by pi from the process env — never written to disk.
        apiKey: "$AI_GATEWAY_API_KEY",
        authHeader: true,
        models: [
          {
            id: GATEWAY_MODEL,
            name: GATEWAY_MODEL,
            reasoning: true,
            input: ["text"],
            contextWindow: 1_048_576,
            maxTokens: 128_000,
          },
        ],
      },
    },
  };

  const write = (name: string, value: unknown) => {
    const file = path.join(dir, name);
    const next = `${JSON.stringify(value, null, 2)}\n`;
    try {
      if (fs.readFileSync(file, "utf8") === next) return;
    } catch {
      // Missing file: fall through and write it.
    }
    fs.writeFileSync(file, next, { mode: 0o600 });
  };

  write("models.json", models);
  write("settings.json", { packages: [] });
  return dir;
}

const dateRange = Type.Object({
  startDate: Type.String({ description: "Inclusive start date, YYYY-MM-DD" }),
  endDate: Type.String({ description: "Inclusive end date, YYYY-MM-DD" }),
  categoryName: Type.Optional(
    Type.String({ description: "Optional category name filter" }),
  ),
});

function buildTools(userId: string): ToolDefinition[] {
  return [
    defineTool({
      name: "spendingByCategory",
      label: "Spending by category",
      description:
        "Total money spent per category (leaf categories only) inside a date range, largest first.",
      parameters: dateRange,
      execute: async (_id, params) => {
        const result = await spendingByCategoryQuery(userId, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined };
      },
    }),
    defineTool({
      name: "topMerchants",
      label: "Top merchants",
      description: "Biggest merchants by money spent in a date range.",
      parameters: dateRange,
      execute: async (_id, params) => {
        const result = await topMerchantsQuery(userId, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined };
      },
    }),
    defineTool({
      name: "searchTransactions",
      label: "Search transactions",
      description:
        "Find individual transactions whose merchant or note matches a text query.",
      parameters: Type.Object({
        query: Type.String({ description: "Merchant or note text to search for" }),
        limit: Type.Optional(
          Type.Number({ description: "Max rows, default 20", minimum: 1, maximum: 50 }),
        ),
      }),
      execute: async (_id, params) => {
        const result = await searchTransactionsQuery(userId, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined };
      },
    }),
    defineTool({
      name: "accountOverview",
      label: "Account overview",
      description: "Current balance per account, grouped by account type.",
      parameters: Type.Object({}),
      execute: async () => {
        const result = await accountOverviewQuery(userId);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined };
      },
    }),
    defineTool({
      name: "monthlyTrend",
      label: "Monthly trend",
      description: "Spending and income totals per month for the most recent N months.",
      parameters: Type.Object({
        months: Type.Optional(
          Type.Number({
            description: "How many recent months to include, default 6",
            minimum: 1,
            maximum: 24,
          }),
        ),
      }),
      execute: async (_id, params) => {
        const result = await monthlyTrendQuery(userId, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined };
      },
    }),
  ];
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

/**
 * Replay the browser's transcript into a fresh session.
 *
 * The client owns history (no server persistence), so the server rebuilds the
 * conversation from the request. Entries are a simple parent chain, which is
 * what `SessionManager` expects.
 */
function seedEntries(turns: ChatTurn[]) {
  const now = Date.now();
  let parentId: string | null = null;
  return turns.map((turn, index) => {
    const id = `seed_${index}`;
    const entry = {
      type: "message" as const,
      id,
      parentId,
      timestamp: new Date(now + index).toISOString(),
      message:
        turn.role === "user"
          ? { role: "user" as const, content: turn.text, timestamp: now + index }
          : {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: turn.text }],
              api: "openai-responses" as const,
              provider: PROVIDER_ID,
              model: GATEWAY_MODEL,
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              stopReason: "stop" as const,
              timestamp: now + index,
            },
    };
    parentId = id;
    return entry;
  });
}

async function createSession(userId: string, history: ChatTurn[]) {
  const dir = writeAgentDir();

  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(dir, "auth.json"),
    modelsPath: path.join(dir, "models.json"),
    refreshOnCreate: false,
  });
  await modelRuntime.setRuntimeApiKey(PROVIDER_ID, gatewayApiKey());

  const model = modelRuntime.getModel(PROVIDER_ID, GATEWAY_MODEL);
  if (!model) throw new Error(`pi could not resolve model ${PROVIDER_ID}/${GATEWAY_MODEL}.`);

  const settingsManager = SettingsManager.inMemory({
    // No persistence, so compaction has nothing to compact across requests.
    compaction: { enabled: false },
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    settingsManager,
    // Nothing from the host machine: no extensions, skills, prompts, themes,
    // or AGENTS.md. The system prompt is ours.
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    model,
    thinkingLevel: THINKING_LEVEL,
    modelRuntime,
    resourceLoader,
    settingsManager,
    // Built-in read/bash/edit/write are useless here and would be a security
    // hole; only the finance tools are exposed.
    noTools: "builtin",
    customTools: buildTools(userId),
    sessionManager: SessionManager.inMemory(dir, undefined, seedEntries(history)),
  });

  return session;
}

/**
 * Run one assistant turn and yield AG-UI chunks.
 *
 * The client already speaks AG-UI through `useChat`, so mapping pi's session
 * events onto that protocol keeps the panel unchanged.
 */
export async function* streamAssistantReply({
  userId,
  history,
  question,
  signal,
}: {
  userId: string;
  history: ChatTurn[];
  question: string;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk> {
  const threadId = `monai-chat-${userId}`;
  const runId = `run_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;

  yield { type: "RUN_STARTED", threadId, runId } as StreamChunk;

  let session: Awaited<ReturnType<typeof createSession>>;
  try {
    session = await createSession(userId, history);
  } catch (error) {
    // Missing/empty AI_GATEWAY_API_KEY lands here. Surface it as a run error so
    // the panel shows a message instead of an open connection that never ends.
    yield {
      type: "RUN_ERROR",
      message:
        error instanceof Error ? error.message : "The assistant is not configured.",
    } as StreamChunk;
    return;
  }
  const queue: StreamChunk[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let textOpen = false;

  const push = (chunk: StreamChunk) => {
    queue.push(chunk);
    notify?.();
  };

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta" && update.delta) {
        if (!textOpen) {
          textOpen = true;
          push({
            type: "TEXT_MESSAGE_START",
            messageId,
            role: "assistant",
          } as StreamChunk);
        }
        push({
          type: "TEXT_MESSAGE_CONTENT",
          messageId,
          delta: update.delta,
        } as StreamChunk);
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      push({
        type: "TOOL_CALL_START",
        toolCallId: event.toolCallId,
        toolCallName: event.toolName,
        parentMessageId: messageId,
      } as StreamChunk);
      return;
    }

    if (event.type === "tool_execution_end") {
      push({
        type: "TOOL_CALL_END",
        toolCallId: event.toolCallId,
      } as StreamChunk);
    }
  });

  const onAbort = () => {
    void session.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const run = session
    .prompt(question)
    .catch((error: unknown) => {
      push({
        type: "RUN_ERROR",
        message: error instanceof Error ? error.message : "The assistant failed.",
      } as StreamChunk);
    })
    .finally(() => {
      finished = true;
      notify?.();
    });

  try {
    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = () => {
            notify = null;
            resolve();
          };
        });
        continue;
      }
      yield queue.shift()!;
    }
    await run;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
    session.dispose();
  }

  if (textOpen) {
    yield { type: "TEXT_MESSAGE_END", messageId } as StreamChunk;
  }
  yield { type: "RUN_FINISHED", threadId, runId } as StreamChunk;
}
