import { createFileRoute } from "@tanstack/react-router";
import {
  chat,
  convertMessagesToModelMessages,
  toServerSentEventsResponse,
  toolDefinition,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, categories, transactions } from "../db/schema";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  GATEWAY_BASE_URL,
  GATEWAY_MODEL,
  GatewayUnavailableError,
  gatewayApiKey,
  gatewayTimeoutSeconds,
} from "../services/aiGateway";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";

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

const dateRangeInput = z.object({
  startDate: z.string().describe("Inclusive start date, YYYY-MM-DD"),
  endDate: z.string().describe("Inclusive end date, YYYY-MM-DD"),
  categoryName: z.string().optional().describe("Optional category name filter"),
});

const searchInput = z.object({
  query: z.string().describe("Merchant or note text to search for"),
  limit: z.number().int().min(1).max(50).optional().describe("Max rows, default 20"),
});

const summaryInput = z.object({
  months: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe("How many recent months to include, default 6"),
});

const toolContext = { userId: "" };

type Ctx = typeof toolContext;

/**
 * Amount sign convention in this database: Plaid's `amount` is stored as-is,
 * so money OUT (a purchase) is POSITIVE and money IN (income, refunds) is
 * NEGATIVE. Verified against Turso: November regular rows are all positive and
 * match the dashboard's "SPENT" figure.
 */
const MONEY_OUT = sql`${transactions.amount} > 0`;

function toDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ownedTransactions(userId: string) {
  // Transactions belong to the user through their account's Plaid item,
  // or directly for manual accounts (accounts.userId).
  return and(
    sql`(${accounts.userId} = ${userId} or exists (
      select 1 from plaid_items pi
      where pi.id = ${accounts.plaidItemId} and pi.user_id = ${userId}
    ))`,
    isNull(transactions.splitParentId),
  );
}

const spendingByCategory = toolDefinition({
  name: "spendingByCategory",
  description:
    "Total money spent per category (leaf categories only) inside a date range, largest first.",
  inputSchema: dateRangeInput,
  outputSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
    total: z.number(),
    transactionCount: z.number(),
    categories: z.array(
      z.object({
        category: z.string(),
        amount: z.number(),
        count: z.number(),
      }),
    ),
  }),
}).server(async (input, context) => {
  const userId = (context?.context as Ctx | undefined)?.userId ?? "";
  const start = toDate(input.startDate);
  const end = toDate(input.endDate);
  const { db } = await import("../db");

  const rows = await db
    .select({
      category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
      total: sql<number>`round(sum(${transactions.amount}), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ownedTransactions(userId),
        eq(transactions.transactionType, "regular"),
        MONEY_OUT,
        start ? gte(transactions.date, start) : undefined,
        end ? sql`${transactions.date} <= ${Math.floor(end.getTime() / 1000)}` : undefined,
        input.categoryName
          ? sql`lower(${categories.name}) = lower(${input.categoryName})`
          : undefined,
      ),
    )
    .groupBy(categories.name)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    total: Number(rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0).toFixed(2)),
    transactionCount: rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
    categories: rows.map((row) => ({
      category: row.category,
      amount: Number(Number(row.total ?? 0).toFixed(2)),
      count: Number(row.count ?? 0),
    })),
  };
});

const topMerchants = toolDefinition({
  name: "topMerchants",
  description: "Biggest merchants by money spent in a date range.",
  inputSchema: dateRangeInput,
  outputSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
    merchants: z.array(
      z.object({
        merchant: z.string(),
        amount: z.number(),
        count: z.number(),
      }),
    ),
  }),
}).server(async (input, context) => {
  const userId = (context?.context as Ctx | undefined)?.userId ?? "";
  const start = toDate(input.startDate);
  const end = toDate(input.endDate);
  const { db } = await import("../db");

  const rows = await db
    .select({
      merchant: transactions.merchantName,
      total: sql<number>`round(sum(${transactions.amount}), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        ownedTransactions(userId),
        eq(transactions.transactionType, "regular"),
        MONEY_OUT,
        start ? gte(transactions.date, start) : undefined,
        end ? sql`${transactions.date} <= ${Math.floor(end.getTime() / 1000)}` : undefined,
        input.categoryName
          ? sql`exists (select 1 from categories c2 where c2.id = ${transactions.categoryId} and lower(c2.name) = lower(${input.categoryName}))`
          : undefined,
      ),
    )
    .groupBy(transactions.merchantName)
    .orderBy(desc(sql`sum(${transactions.amount})`))
    .limit(10);

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    merchants: rows.map((row) => ({
      merchant: row.merchant,
      amount: Number(Number(row.total ?? 0).toFixed(2)),
      count: Number(row.count ?? 0),
    })),
  };
});

const searchTransactions = toolDefinition({
  name: "searchTransactions",
  description: "Find individual transactions whose merchant or note matches a text query.",
  inputSchema: searchInput,
  outputSchema: z.object({
    transactions: z.array(
      z.object({
        id: z.number(),
        date: z.string(),
        merchant: z.string(),
        amount: z.number(),
        category: z.string(),
        note: z.string().nullable(),
      }),
    ),
  }),
}).server(async (input, context) => {
  const userId = (context?.context as Ctx | undefined)?.userId ?? "";
  const { db } = await import("../db");
  const needle = `%${input.query.toLowerCase()}%`;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      merchant: transactions.merchantName,
      amount: transactions.amount,
      category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ownedTransactions(userId),
        sql`(lower(${transactions.merchantName}) like ${needle} or lower(coalesce(${transactions.note}, '')) like ${needle})`,
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(input.limit ?? 20);

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      merchant: row.merchant,
      amount: Number(Number(row.amount ?? 0).toFixed(2)),
      category: row.category,
      note: row.note ?? null,
    })),
  };
});

const accountOverview = toolDefinition({
  name: "accountOverview",
  description: "Current balance per account, grouped by account type.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        balance: z.number(),
      }),
    ),
    byType: z.array(z.object({ type: z.string(), balance: z.number() })),
  }),
}).server(async (_input, context) => {
  const userId = (context?.context as Ctx | undefined)?.userId ?? "";
  const { db } = await import("../db");

  const rows = await db
    .select({
      name: accounts.name,
      type: accounts.type,
      balance: accounts.currentBalance,
    })
    .from(accounts)
    .where(
      sql`${accounts.userId} = ${userId} or exists (
        select 1 from plaid_items pi
        where pi.id = ${accounts.plaidItemId} and pi.user_id = ${userId}
      )`,
    )
    .orderBy(desc(accounts.currentBalance));

  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + Number(row.balance ?? 0));
  }

  return {
    accounts: rows.map((row) => ({
      name: row.name,
      type: row.type,
      balance: Number(Number(row.balance ?? 0).toFixed(2)),
    })),
    byType: [...byType.entries()].map(([type, balance]) => ({
      type,
      balance: Number(balance.toFixed(2)),
    })),
  };
});

const monthlyTrend = toolDefinition({
  name: "monthlyTrend",
  description: "Spending and income totals per month for the most recent N months.",
  inputSchema: summaryInput,
  outputSchema: z.object({
    months: z.array(
      z.object({
        month: z.string(),
        spend: z.number(),
        income: z.number(),
        count: z.number(),
      }),
    ),
  }),
}).server(async (input, context) => {
  const userId = (context?.context as Ctx | undefined)?.userId ?? "";
  const { db } = await import("../db");
  const monthLimit = input.months ?? 6;

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`,
      spend: sql<number>`round(coalesce(sum(case when ${MONEY_OUT} and ${transactions.transactionType} = 'regular' then ${transactions.amount} else 0 end), 0), 2)`,
      income: sql<number>`round(coalesce(sum(case when ${transactions.transactionType} = 'income' then -${transactions.amount} else 0 end), 0), 2)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(ownedTransactions(userId))
    .groupBy(sql`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`)
    .orderBy(desc(sql`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`))
    .limit(monthLimit);

  return {
    months: rows.map((row) => ({
      month: row.month,
      spend: Number(row.spend ?? 0),
      income: Number(row.income ?? 0),
      count: Number(row.count ?? 0),
    })),
  };
});

const TOOLS = [
  spendingByCategory,
  topMerchants,
  searchTransactions,
  accountOverview,
  monthlyTrend,
];

type ChatBody = {
  messages?: Array<Record<string, unknown>>;
  forwardedProps?: { message?: string };
  data?: { message?: string };
};

function hasParts(message: Record<string, unknown>) {
  return Array.isArray(message.parts);
}

/**
 * The TanStack chat client posts already-converted `ModelMessage`s, but a
 * hand-rolled client may post `UIMessage`s (with `parts`). Convert when needed
 * so both work. System messages are dropped: the server owns the system prompt.
 */
async function toModelMessages(body: ChatBody) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return [] as ModelMessage[];

  const converted = messages.some(hasParts)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      convertMessagesToModelMessages(messages as any)
    : (messages as unknown as ModelMessage[]);

  // The server owns the system prompt.
  return converted.filter(
    (message) => (message as { role: string }).role !== "system",
  );
}

function latestUserText(messages: Array<{ role: string; content: unknown }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      const text = message.content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : "",
        )
        .join(" ")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userId } = await getAuthOrDevAuth();
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: ChatBody;
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const modelMessages = await toModelMessages(body);
        const question = latestUserText(modelMessages);
        if (!question) {
          return Response.json({ error: "No user message" }, { status: 400 });
        }

        const abortController = new AbortController();
        const timeout = setTimeout(
          () => abortController.abort(),
          gatewayTimeoutSeconds() * 1000,
        );

        let stream: AsyncIterable<StreamChunk>;
        try {
          const adapter = openaiCompatibleText(GATEWAY_MODEL, {
            baseURL: GATEWAY_BASE_URL,
            apiKey: gatewayApiKey(),
          });

          stream = chat({
            adapter,
            threadId: `monai-chat-${userId}`,
            context: { userId } satisfies Ctx,
            systemPrompts: [SYSTEM_PROMPT],
            messages: modelMessages.length ? modelMessages : [{ role: "user", content: question }],
            tools: TOOLS,
          });
        } catch (error) {
          clearTimeout(timeout);
          const message =
            error instanceof GatewayUnavailableError
              ? error.message
              : error instanceof Error
                ? error.message
                : "AI Gateway request failed.";
          return Response.json({ error: message }, { status: 503 });
        }

        // Clear the timeout only after the stream drains, not when the
        // Response is returned — the model is still working at that point.
        async function* withTimeoutCleanup() {
          try {
            yield* stream;
          } finally {
            clearTimeout(timeout);
          }
        }

        return toServerSentEventsResponse(withTimeoutCleanup(), { abortController });
      },
    },
  },
});
