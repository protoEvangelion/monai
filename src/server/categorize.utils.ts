import OpenAI from "openai";
import { categories } from "../db/schema";
import { eq } from "drizzle-orm";

let openrouter: OpenAI | null = null;

export function getOpenRouter(): OpenAI {
  if (!openrouter) {
    openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://monai.app",
        "X-Title": "Monai",
      },
    });
  }
  return openrouter;
}

export type Category = { id: number; name: string; parentId: number | null };
export type Transaction = { id: number; merchantName: string; amount: number };
export type BatchResult = { byMerchant: Map<string, string>; model: string };

export const FREE_MODEL_CANDIDATES = [
  process.env.OPENROUTER_CATEGORIZER_MODEL,
  "openai/gpt-oss-20b:free",
  "google/gemma-3-12b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
].filter((m): m is string => Boolean(m));

export function isCatchAllCategory(name: string): boolean {
  const key = name.toLowerCase();
  return (
    key.includes("other") ||
    key.includes("misc") ||
    key.includes("general") ||
    key.includes("uncategorized")
  );
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

// Fallback heuristic: score categories by token overlap + income/expense hints.
// Used when LLM fails or returns no match. Better than leaving row uncategorized.
export function pickHeuristicCategoryId(
  tx: Transaction,
  cats: Category[],
): number {
  if (cats.length === 1) return cats[0].id;

  const merchantTokens = new Set(tokenize(tx.merchantName));
  const incomeHint = tx.amount < 0;

  let best = cats[0];
  let bestScore = -1;

  for (const cat of cats) {
    const catTokens = tokenize(cat.name);
    let score = catTokens.reduce(
      (sum, token) => sum + (merchantTokens.has(token) ? 3 : 0),
      0,
    );

    const catName = cat.name.toLowerCase();
    if (
      incomeHint &&
      /(income|salary|paycheck|refund|reimburse|interest|dividend)/.test(
        catName,
      )
    ) {
      score += 2;
    }
    if (
      !incomeHint &&
      /(grocer|food|restaurant|dining|gas|transport|travel|shopping|rent|utility|bill)/.test(
        catName,
      )
    ) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  return best.id;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function parseCategoryMap(raw: string): Map<string, string> {
  const trimmed = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "");
  const parsed = JSON.parse(trimmed || "{}") as Record<string, unknown>;
  const map = new Map<string, string>();

  for (const [merchant, category] of Object.entries(parsed)) {
    if (typeof merchant !== "string" || typeof category !== "string") continue;
    map.set(normalizeName(merchant), category);
  }

  return map;
}

export async function categorizeBatch(
  batch: Transaction[],
  cats: Category[],
): Promise<BatchResult> {
  const uniqueCategoryNames = [...new Set(cats.map((c) => c.name))];
  const uniqueMerchantNames = [...new Set(batch.map((t) => t.merchantName))];

  const line1 =
    'We are going to give you a list of transactions & categories. Return valid json where key is transaction name & value is category. Example output: {"mcdonalds blah":"restaurants","texico gas": "gas"}';
  const line2 = `Categories: ${JSON.stringify(uniqueCategoryNames)} Transactions: ${JSON.stringify(uniqueMerchantNames)}`;
  const prompt = `${line1}\n${line2}`;

  let lastError: unknown = null;
  const client = getOpenRouter();
  for (const model of FREE_MODEL_CANDIDATES) {
    try {
      console.log("[categorize][prompt]", JSON.stringify({ model, prompt }));

      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      console.log("[categorize][response]", JSON.stringify({ model, raw }));
      return { byMerchant: parseCategoryMap(raw), model };
    } catch (err) {
      lastError = err;
      console.warn(`Categorizer model failed: ${model}`);
    }
  }

  throw (
    lastError ?? new Error("No OpenRouter free categorizer model succeeded")
  );
}

export async function getAllowedLeafCats(userId: string) {
  const { db } = await import("../db");
  const allCats = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
  });
  const leafCats = allCats.filter((c) => c.parentId !== null);
  const nonCatchAllLeafCats = leafCats.filter(
    (c) => !isCatchAllCategory(c.name),
  );
  return {
    allCats,
    allowedLeafCats:
      nonCatchAllLeafCats.length > 0 ? nonCatchAllLeafCats : leafCats,
  };
}
