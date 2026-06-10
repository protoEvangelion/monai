import { categories } from "../db/schema";
import { eq } from "drizzle-orm";

export type Category = { id: number; name: string; parentId: number | null };
export type Transaction = {
  id: number;
  merchantName: string;
  amount: number;
  note: string | null;
};
export type BatchResult = { byTransactionId: Map<number, string>; model: string };

export const COPILOT_CATEGORIZER_MODEL = process.env.COPILOT_CATEGORIZER_MODEL ?? "gpt-5.4-mini";
const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH ?? "copilot";

export function isCatchAllCategory(name: string): boolean {
  const key = name.toLowerCase();
  return (
    key.includes("other") ||
    key.includes("misc") ||
    key.includes("general") ||
    key.includes("uncategorized")
  );
}

export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function isTransferCategoryName(name: string): boolean {
  const key = normalizeName(name);
  return (
    key === "transfer" ||
    key === "transfers" ||
    key === "internal transfer" ||
    key === "account transfer" ||
    key === "credit card" ||
    key === "credit card payment"
  );
}

export function isIncomeCategoryName(name: string): boolean {
  const key = normalizeName(name);
  return key === "income" || key === "salary" || key === "payroll";
}

export function parseTransactionCategoryMap(raw: string): Map<number, string> {
  const cleaned = raw
    .trim()
    .replace(/^●\s*/, "")
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(
      [
        "Categorizer did not return a JSON object.",
        "Raw response preview:",
        previewBlock(formatRawCategorizerResponse(raw), 1_200),
      ].join("\n"),
    );
  }

  const json = cleaned.slice(start, end + 1);
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    try {
      parsed = JSON.parse(repairWrappedJsonStrings(json)) as Record<string, unknown>;
    } catch {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        [
          `Categorizer returned invalid JSON: ${message}`,
          "Raw response preview:",
          previewBlock(formatRawCategorizerResponse(raw), 1_200),
        ].join("\n"),
      );
    }
  }

  const map = new Map<number, string>();

  for (const [transactionId, category] of Object.entries(parsed)) {
    const id = Number(transactionId);
    if (!Number.isInteger(id) || typeof category !== "string") continue;
    map.set(id, category);
  }

  return map;
}

function repairWrappedJsonStrings(json: string) {
  let repaired = "";
  let inString = false;
  let escaped = false;
  let pendingWrappedWhitespace = false;

  for (const char of json) {
    if (!inString) {
      repaired += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      if (pendingWrappedWhitespace) {
        repaired += " ";
        pendingWrappedWhitespace = false;
      }
      repaired += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      if (pendingWrappedWhitespace) {
        repaired += " ";
        pendingWrappedWhitespace = false;
      }
      repaired += char;
      inString = false;
      continue;
    }

    if (char < " ") {
      pendingWrappedWhitespace = true;
      continue;
    }

    if (pendingWrappedWhitespace) {
      if (/\s/.test(char)) continue;
      repaired += " ";
      pendingWrappedWhitespace = false;
    }

    repaired += char;
  }

  return repaired;
}

async function runCopilotCategorizer(prompt: string) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("node:child_process"),
    import("node:util"),
  ]);
  const execFileAsync = promisify(execFile);
  const { stdout, stderr } = await execFileAsync(
    COPILOT_CLI_PATH,
    [
      "--model",
      COPILOT_CATEGORIZER_MODEL,
      "-p",
      prompt,
      "--silent",
      "--no-color",
      "--stream",
      "off",
      "--allow-all-tools",
      "--disable-builtin-mcps",
      "--deny-tool=shell",
      "--deny-tool=read",
      "--deny-tool=write",
      "--no-custom-instructions",
      "--no-ask-user",
    ],
    {
      timeout: Number(process.env.COPILOT_CATEGORIZER_TIMEOUT_MS ?? 90_000),
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    },
  );

  return `${stdout}\n${stderr}`.trim();
}

function previewBlock(value: string, maxLength: number) {
  const preview = value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  return preview
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function logCategorizeRequest({
  model,
  rowCount,
  categoryNames,
  transactionRows,
}: {
  model: string;
  rowCount: number;
  categoryNames: string[];
  transactionRows: string[];
}) {
  console.log(
    [
      "[categorize] batch request",
      "  provider: copilot-cli",
      `  model: ${model}`,
      `  categories: ${categoryNames.length}`,
      ...categoryNames.map((name) => `    - ${name}`),
      `  transactionRows: ${rowCount}`,
      ...transactionRows.map((row) => `    - ${row}`),
    ].join("\n"),
  );
}

function logCategorizeResponse({ model, raw }: { model: string; raw: string }) {
  const formattedRaw = formatRawCategorizerResponse(raw);
  console.log(
    [
      "[categorize] batch response",
      "  provider: copilot-cli",
      `  model: ${model}`,
      "  raw:",
      previewBlock(formattedRaw, 4_000),
    ].join("\n"),
  );
}

function formatRawCategorizerResponse(raw: string) {
  const cleaned = raw.trim().replace(/^●\s*/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return raw;

  try {
    const json = cleaned.slice(start, end + 1);
    const parsed = JSON.parse(json) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    try {
      const json = repairWrappedJsonStrings(cleaned.slice(start, end + 1));
      const parsed = JSON.parse(json) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
}

export async function categorizeBatch(
  batch: Transaction[],
  cats: Category[],
): Promise<BatchResult> {
  const uniqueCategoryNames = [...new Set(cats.map((c) => c.name))];
  const categoryOptions = [...new Set(["Transfer", "Income", ...uniqueCategoryNames])];
  const transactionRows = batch.map((tx) => ({
    id: tx.id,
    merchant: tx.merchantName,
    amount: tx.amount,
    ...(tx.note?.trim() ? { note: tx.note.trim() } : {}),
  }));

  const line1 =
    'Classify each transaction into exactly one value from the provided category list. When note is present, use it as receipt/order context for the merchant. Use "Transfer" for internal account transfers, savings/checking transfers, credit-card payments, and other balance movements that should have no budget category. Use "Income" for payroll, deposits, interest, reimbursements, refunds, and other money received that should have no expense category. Return only a valid JSON object where each key is the exact transaction id as a string and each value is the exact category name. Do not include markdown, bullets, explanation, or line breaks inside JSON strings. Example output: {"123":"Restaurants","124":"Transfer","125":"Income"}';
  const line2 = `Categories: ${JSON.stringify(categoryOptions)} Transactions: ${JSON.stringify(transactionRows)}`;
  const prompt = `${line1}\n${line2}`;

  logCategorizeRequest({
    model: COPILOT_CATEGORIZER_MODEL,
    rowCount: batch.length,
    categoryNames: categoryOptions,
    transactionRows: transactionRows.map((tx) =>
      [tx.id, tx.amount, tx.merchant, "note" in tx ? tx.note : null]
        .filter((value) => value != null && value !== "")
        .join(" | "),
    ),
  });
  const raw = await runCopilotCategorizer(prompt);
  logCategorizeResponse({ model: COPILOT_CATEGORIZER_MODEL, raw });
  return {
    byTransactionId: parseTransactionCategoryMap(raw),
    model: COPILOT_CATEGORIZER_MODEL,
  };
}

export async function getAllowedLeafCats(userId: string) {
  const { db } = await import("../db");
  const allCats = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
  });
  const leafCats = allCats.filter((c) => c.parentId !== null);
  const nonCatchAllLeafCats = leafCats.filter((c) => !isCatchAllCategory(c.name));
  return {
    allCats,
    allowedLeafCats: nonCatchAllLeafCats.length > 0 ? nonCatchAllLeafCats : leafCats,
  };
}
