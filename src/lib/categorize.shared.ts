export type CategoryOption = { id: number; name: string; parentId: number | null };
export type CategorizeTransactionRow = {
  id: number;
  merchantName: string;
  amount: number;
  note: string | null;
};

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

export function buildCategorizePrompt(
  batch: CategorizeTransactionRow[],
  cats: Array<{ name: string }>,
) {
  const uniqueCategoryNames = [...new Set(cats.map((c) => c.name))];
  const categoryOptions = [...new Set(["Transfer", "Income", ...uniqueCategoryNames])];
  const transactionRows = batch.map((tx) => ({
    id: tx.id,
    merchant: tx.merchantName,
    amount: tx.amount,
    ...(tx.note?.trim() ? { note: tx.note.trim() } : {}),
  }));

  const line1 =
    'Classify each transaction into exactly one value from the provided category list. When note is present, use it as receipt/order context for the merchant. Use "Transfer" for internal account transfers, savings/checking transfers, credit-card payments, and other balance movements that should have no budget category. Use "Income" for payroll, deposits, interest, reimbursements, refunds, and other money received that should have no expense category. Return only valid JSON in this exact shape: {"categories":[{"transactionId":123,"category":"Restaurants"},{"transactionId":124,"category":"Transfer"},{"transactionId":125,"category":"Income"}]}. Each transactionId must be the exact numeric transaction id. Each category must be one exact category name from the category list. Do not include markdown, bullets, explanation, or line breaks inside JSON strings.';
  const line2 = `Categories: ${JSON.stringify(categoryOptions)} Transactions: ${JSON.stringify(transactionRows)}`;

  return {
    prompt: `${line1}\n${line2}`,
    categoryOptions,
  };
}

/** Compact prompt for Chrome Gemini Nano's small context window. */
export function buildNanoCategorizePrompt(
  batch: CategorizeTransactionRow[],
  cats: Array<{ name: string }>,
) {
  const uniqueCategoryNames = [...new Set(cats.map((c) => c.name))];
  const categoryOptions = [...new Set(["Transfer", "Income", ...uniqueCategoryNames])];
  const catsCsv = categoryOptions.join("|");
  const txsCsv = batch
    .map((tx) => {
      const note = tx.note?.trim();
      const notePart = note ? `|${note.slice(0, 48)}` : "";
      return `${tx.id}|${tx.merchantName}|${tx.amount}${notePart}`;
    })
    .join(";");

  const prompt = [
    'Map each tx to one category. Transfer=cc/bank moves. Income=pay/deposit/interest. JSON only: {"categories":[{"transactionId":1,"category":"Name"}]}',
    `C:${catsCsv}`,
    `T:${txsCsv}`,
  ].join("\n");

  return { prompt, categoryOptions };
}

function previewBlock(value: string, maxLength: number) {
  const preview = value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  return preview
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
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

  if (Array.isArray(parsed.categories)) {
    for (const item of parsed.categories) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      const transactionId = Number(
        candidate.transactionId ?? candidate.id ?? candidate.transaction_id,
      );
      const category = candidate.category ?? candidate.name ?? candidate.label;
      if (!Number.isInteger(transactionId) || typeof category !== "string") continue;
      const trimmed = category.trim();
      if (!trimmed) continue;
      map.set(transactionId, trimmed);
    }
    return map;
  }

  for (const [transactionId, category] of Object.entries(parsed)) {
    const id = Number(transactionId);
    if (!Number.isInteger(id) || typeof category !== "string") continue;
    map.set(id, category);
  }

  return map;
}
