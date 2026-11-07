import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  categorizationRules,
  categories,
  plaidItems,
  transactions,
} from "../db/schema";
import { ruleMatches } from "./rules.match";

type TransactionType = "regular" | "income" | "transfer";

/** Blank means "any amount". Otherwise store absolute dollars rounded to cents. */
function parseRuleAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(raw)) throw new Error("Amount must be a dollar value");
  return Math.round(Math.abs(raw) * 100) / 100;
}

async function getUserAccountIds(db: typeof import("../db").db, userId: string) {
  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });
  return userPlaidItems.flatMap((item) => item.accounts.map((account) => account.id));
}

export async function applyCategorizationRules(
  userId: string,
  opts: { accountIds?: number[]; transactionIds?: number[] } = {},
) {
  const { db } = await import("../db");
  const rules = await db.query.categorizationRules.findMany({
    where: eq(categorizationRules.userId, userId),
    orderBy: [desc(categorizationRules.id)],
  });
  if (!rules.length) return { matched: 0, updated: 0 };

  const accountIds = opts.accountIds?.length
    ? opts.accountIds
    : await getUserAccountIds(db, userId);
  if (!accountIds.length) return { matched: 0, updated: 0 };

  const candidates = await db.query.transactions.findMany({
    where: and(
      inArray(transactions.accountId, accountIds),
      opts.transactionIds?.length
        ? inArray(transactions.id, opts.transactionIds)
        : undefined,
    ),
  });

  let matched = 0;
  let updated = 0;

  for (const tx of candidates) {
    // Don't override manually reviewed txs unless they have no category yet.
    if (tx.isReviewed && tx.categoryId != null && tx.ruleId == null) continue;

    const rule = rules.find((item) =>
      ruleMatches(item, {
        merchantName: tx.merchantName,
        name: tx.name,
        amount: tx.amount,
      }),
    );
    if (!rule) continue;
    matched += 1;

    const nextCategoryId =
      rule.transactionType === "regular" ? rule.categoryId : null;
    const nextType = rule.transactionType;
    const unchanged =
      tx.ruleId === rule.id &&
      tx.categoryId === nextCategoryId &&
      tx.transactionType === nextType;
    if (unchanged) continue;

    await db
      .update(transactions)
      .set({
        ruleId: rule.id,
        categoryId: nextCategoryId,
        transactionType: nextType,
      })
      .where(eq(transactions.id, tx.id));
    updated += 1;
  }

  return { matched, updated };
}

export const getCategorizationRules = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  const { db } = await import("../db");

  return db.query.categorizationRules.findMany({
    where: eq(categorizationRules.userId, userId),
    orderBy: [desc(categorizationRules.updatedAt), desc(categorizationRules.id)],
    with: { category: true },
  });
});

export const createCategorizationRule = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ((ctx as any).data ?? {}) as {
    pattern?: string;
    amount?: number | string | null;
    categoryId?: number | null;
    transactionType?: TransactionType;
    applyToExisting?: boolean;
  };

  const pattern = String(data.pattern ?? "").trim();
  const amount = parseRuleAmount(data.amount);
  if (!pattern && amount == null) throw new Error("Add match text or an amount");

  const transactionType: TransactionType = data.transactionType ?? "regular";
  let categoryId = data.categoryId ?? null;
  if (transactionType !== "regular") categoryId = null;
  if (transactionType === "regular") {
    if (categoryId == null) throw new Error("Category is required for regular rules");
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    });
    if (!category || category.parentId == null) {
      throw new Error("Pick a leaf category");
    }
  }

  const [rule] = await db
    .insert(categorizationRules)
    .values({
      userId,
      pattern,
      amount,
      categoryId,
      transactionType,
      updatedAt: new Date(),
    })
    .returning();

  if (data.applyToExisting !== false) {
    await applyCategorizationRules(userId);
  }

  return rule;
});

export const updateCategorizationRule = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ((ctx as any).data ?? {}) as {
    id: number;
    pattern?: string;
    amount?: number | string | null;
    categoryId?: number | null;
    transactionType?: TransactionType;
    applyToExisting?: boolean;
  };

  const existing = await db.query.categorizationRules.findFirst({
    where: and(eq(categorizationRules.id, data.id), eq(categorizationRules.userId, userId)),
  });
  if (!existing) throw new Error("Rule not found");

  const pattern = data.pattern != null ? String(data.pattern).trim() : existing.pattern;
  const amount = data.amount !== undefined ? parseRuleAmount(data.amount) : existing.amount;
  if (!pattern && amount == null) throw new Error("Add match text or an amount");

  const transactionType: TransactionType = data.transactionType ?? existing.transactionType;
  let categoryId =
    data.categoryId !== undefined ? data.categoryId : existing.categoryId;
  if (transactionType !== "regular") categoryId = null;
  if (transactionType === "regular") {
    if (categoryId == null) throw new Error("Category is required for regular rules");
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    });
    if (!category || category.parentId == null) {
      throw new Error("Pick a leaf category");
    }
  }

  const [rule] = await db
    .update(categorizationRules)
    .set({
      pattern,
      amount,
      categoryId,
      transactionType,
      updatedAt: new Date(),
    })
    .where(eq(categorizationRules.id, existing.id))
    .returning();

  if (data.applyToExisting !== false) {
    await applyCategorizationRules(userId);
  }

  return rule;
});

export const deleteCategorizationRule = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = ((ctx as any).data ?? {}) as { id: number };
  const existing = await db.query.categorizationRules.findFirst({
    where: and(eq(categorizationRules.id, id), eq(categorizationRules.userId, userId)),
  });
  if (!existing) throw new Error("Rule not found");

  await db
    .update(transactions)
    .set({ ruleId: null })
    .where(eq(transactions.ruleId, id));
  await db.delete(categorizationRules).where(eq(categorizationRules.id, id));
  return { ok: true };
});

export const applyRulesNow = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  return applyCategorizationRules(userId);
});
