import { createServerFn } from "@tanstack/react-start";
import { transactions, accounts, plaidItems } from "../db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  isCatchAllCategory,
  isIncomeCategoryName,
  isTransferCategoryName,
  normalizeName,
  getAllowedLeafCats,
} from "./categorize.utils";

export type CategorizeTransactionsResult = {
  requestedCount: number;
  updatedCount: number;
  skippedCount: number;
};

export const AI_CATEGORIZE_MAX_TRANSACTIONS = 100;

function resolveAssignment(
  proposedCategoryName: string | undefined,
  categoryByNormalizedName: Map<string, number>,
  categoryByCompactName: Map<string, number>,
  categoryNames: string[],
  validIds: Set<number>,
  existingCategoryId: number | null,
): { categoryId: number | null; transactionType: "regular" | "income" | "transfer" } | null {
  const compact = (value: string) => normalizeName(value).replace(/[^a-z0-9]/g, "");

  if (
    proposedCategoryName &&
    (isTransferCategoryName(proposedCategoryName) || compact(proposedCategoryName) === "transfer")
  ) {
    return { categoryId: null, transactionType: "transfer" };
  }

  if (
    proposedCategoryName &&
    (isIncomeCategoryName(proposedCategoryName) || compact(proposedCategoryName) === "income")
  ) {
    return { categoryId: null, transactionType: "income" };
  }

  if (proposedCategoryName) {
    const normalized = normalizeName(proposedCategoryName);
    const proposedCategoryId = categoryByNormalizedName.get(normalized);
    if (proposedCategoryId && validIds.has(proposedCategoryId)) {
      return { categoryId: proposedCategoryId, transactionType: "regular" };
    }

    const proposedCompactCategoryId = categoryByCompactName.get(compact(proposedCategoryName));
    if (proposedCompactCategoryId && validIds.has(proposedCompactCategoryId)) {
      return { categoryId: proposedCompactCategoryId, transactionType: "regular" };
    }

    // Fuzzy: unique prefix / contains match against leaf names (Nano often shortens).
    const needle = compact(proposedCategoryName);
    if (needle.length >= 3) {
      const fuzzyHits = categoryNames.filter((name) => {
        const hay = compact(name);
        return hay === needle || hay.startsWith(needle) || needle.startsWith(hay) || hay.includes(needle);
      });
      if (fuzzyHits.length === 1) {
        const id = categoryByNormalizedName.get(normalizeName(fuzzyHits[0]));
        if (id && validIds.has(id)) {
          return { categoryId: id, transactionType: "regular" };
        }
      }
    }
  }

  if (existingCategoryId != null && validIds.has(existingCategoryId)) {
    return { categoryId: existingCategoryId, transactionType: "regular" };
  }

  return null;
}

/** Resolve which transaction IDs to categorize for the current user. */
async function resolveSelectedTransactionIds({
  userId,
  ids,
  limit,
  scope,
  searchQuery,
}: {
  userId: string;
  ids?: number[];
  limit?: number;
  scope?: "all" | "review";
  searchQuery?: string;
}) {
  const { db } = await import("../db");
  const batchLimit = Math.min(
    AI_CATEGORIZE_MAX_TRANSACTIONS,
    Math.max(1, Number(limit) || AI_CATEGORIZE_MAX_TRANSACTIONS),
  );
  const selectedIds = Array.isArray(ids)
    ? ids.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : undefined;

  let uniqueSelectedIds = selectedIds ? [...new Set(selectedIds)].slice(0, batchLimit) : undefined;

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });

  if (!uniqueSelectedIds?.length && scope) {
    const accountIds = items.flatMap((item) => item.accounts.map((account) => account.id));
    if (accountIds.length > 0) {
      const query = searchQuery?.trim().toLowerCase() ?? "";
      const candidates = await db.query.transactions.findMany({
        where: inArray(transactions.accountId, accountIds),
        orderBy: [desc(transactions.date)],
        with: { category: true },
      });

      uniqueSelectedIds = candidates
        .filter((tx) => (scope === "review" ? !tx.isReviewed : true))
        .filter((tx) => tx.transactionType === "regular")
        .filter((tx) => !query || tx.merchantName.toLowerCase().includes(query))
        .filter(
          (tx) =>
            tx.categoryId == null ||
            (tx.category?.name ? isCatchAllCategory(tx.category.name) : false),
        )
        .slice(0, batchLimit)
        .map((tx) => tx.id);
    }
  }

  return { uniqueSelectedIds, items, batchLimit };
}

/**
 * Apply rules, then return the transaction rows + leaf categories for browser AI.
 * Does not call any model on the server.
 */
export async function prepareAICategorizationForUser(
  userId: string,
  data: {
    ids?: number[];
    limit?: number;
    scope?: "all" | "review";
    searchQuery?: string;
  } = {},
) {
  const { db } = await import("../db");

  const { uniqueSelectedIds, items } = await resolveSelectedTransactionIds({
    userId,
    ...data,
  });

  if (!uniqueSelectedIds?.length) {
    throw new Error("No uncategorized transactions found for AI categorization.");
  }

  const { allowedLeafCats } = await getAllowedLeafCats(userId);
  if (allowedLeafCats.length === 0) {
    throw new Error("No categories available for AI categorization.");
  }

  const selectedSet = new Set(uniqueSelectedIds);
  const payloadTransactions: Array<{
    id: number;
    merchantName: string;
    amount: number;
    note: string | null;
  }> = [];

  for (const item of items) {
    const accountIds = item.accounts.map((a) => a.id);
    if (!accountIds.length) continue;

    const { applyCategorizationRules } = await import("./rules.fns");
    await applyCategorizationRules(userId, {
      accountIds,
      transactionIds: uniqueSelectedIds,
    });

    const itemTransactions = await db.query.transactions.findMany({
      where: inArray(transactions.accountId, accountIds),
      with: { category: true },
    });

    for (const tx of itemTransactions) {
      if (!selectedSet.has(tx.id)) continue;
      if (tx.ruleId != null) continue;
      if (tx.transactionType !== "regular") continue;
      payloadTransactions.push({
        id: tx.id,
        merchantName: tx.merchantName,
        amount: tx.amount,
        note: tx.note,
      });
    }
  }

  if (payloadTransactions.length === 0) {
    return {
      transactions: [],
      categories: allowedLeafCats.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
      })),
      skippedByRulesOrType: uniqueSelectedIds.length,
    };
  }

  return {
    transactions: payloadTransactions,
    categories: allowedLeafCats.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
    })),
    skippedByRulesOrType: uniqueSelectedIds.length - payloadTransactions.length,
  };
}

export const prepareAICategorization = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ((ctx as any)?.data ?? {}) as {
    ids?: number[];
    limit?: number;
    scope?: "all" | "review";
    searchQuery?: string;
  };
  return prepareAICategorizationForUser(userId, data);
});

/**
 * Persist browser AI (or any client) category assignments after validation.
 */
export async function applyAICategorizationForUser(
  userId: string,
  assignments: Array<{ transactionId: number | string; category: string }>,
) {
  const { db } = await import("../db");

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return {
      requestedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      skipReasons: [] as string[],
    };
  }

  const { allowedLeafCats } = await getAllowedLeafCats(userId);
  const categoryByNormalizedName = new Map<string, number>();
  const categoryByCompactName = new Map<string, number>();
  const categoryNames: string[] = [];
  for (const cat of allowedLeafCats) {
    categoryNames.push(cat.name);
    const key = normalizeName(cat.name);
    if (!categoryByNormalizedName.has(key)) categoryByNormalizedName.set(key, cat.id);
    const compactKey = key.replace(/[^a-z0-9]/g, "");
    if (!categoryByCompactName.has(compactKey)) {
      categoryByCompactName.set(compactKey, cat.id);
    }
  }
  const validIds = new Set(allowedLeafCats.map((c) => c.id));

  const normalizedAssignments = assignments.map((a) => ({
    transactionId: Number(a.transactionId),
    category: typeof a.category === "string" ? a.category.trim() : "",
  }));

  const uniqueIds = [
    ...new Set(
      normalizedAssignments
        .map((a) => a.transactionId)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];

  const rows =
    uniqueIds.length === 0
      ? []
      : await db.query.transactions.findMany({
          where: inArray(transactions.id, uniqueIds),
          with: {
            account: { with: { plaidItem: true } },
            category: true,
          },
        });

  const owned = rows.filter(
    (tx) =>
      tx.account?.plaidItem?.userId === userId ||
      (tx.account as { userId?: string | null } | undefined)?.userId === userId,
  );
  const ownedById = new Map(owned.map((tx) => [tx.id, tx]));

  let updatedCount = 0;
  let skippedCount = 0;
  const skipReasons: string[] = [];

  for (const assignment of normalizedAssignments) {
    const tx = ownedById.get(assignment.transactionId);
    if (!tx) {
      skippedCount += 1;
      skipReasons.push(`tx ${assignment.transactionId}: not found/owned`);
      continue;
    }
    if (tx.ruleId != null) {
      skippedCount += 1;
      skipReasons.push(`tx ${assignment.transactionId}: locked by rule`);
      continue;
    }
    if (tx.transactionType !== "regular") {
      skippedCount += 1;
      skipReasons.push(
        `tx ${assignment.transactionId}: type is ${tx.transactionType}`,
      );
      continue;
    }

    const resolved = resolveAssignment(
      assignment.category,
      categoryByNormalizedName,
      categoryByCompactName,
      categoryNames,
      validIds,
      tx.categoryId,
    );

    if (!resolved) {
      skippedCount += 1;
      skipReasons.push(
        `tx ${assignment.transactionId}: unknown category "${assignment.category}"`,
      );
      continue;
    }

    await db
      .update(transactions)
      .set({
        categoryId: resolved.categoryId,
        transactionType: resolved.transactionType,
      })
      .where(eq(transactions.id, tx.id));
    updatedCount += 1;
  }

  if (skipReasons.length) {
    console.warn("[categorize] apply skipped:", skipReasons.join("; "));
  }

  return {
    requestedCount: assignments.length,
    updatedCount,
    skippedCount,
    skipReasons,
  };
}

export const applyAICategorization = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { assignments } = ((ctx as any)?.data ?? {}) as {
    assignments?: Array<{ transactionId: number; category: string }>;
  };
  return applyAICategorizationForUser(userId, assignments ?? []);
});

/**
 * Rules-only categorization for sync (no server-side LLM).
 */
export async function applyRulesForItem(userId: string, itemId: number) {
  const { db } = await import("../db");
  const accs = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountIds = accs.map((a) => a.id);
  if (!accountIds.length) return { updated: 0 };

  const { applyCategorizationRules } = await import("./rules.fns");
  return applyCategorizationRules(userId, { accountIds });
}
