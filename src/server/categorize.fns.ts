import { transactions, accounts } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  isCatchAllCategory,
  isIncomeCategoryName,
  isTransferCategoryName,
  normalizeName,
  categorizeBatch,
  getAllowedLeafCats,
} from "./categorize.utils";

export type CategorizeTransactionsResult = {
  requestedCount: number;
  updatedCount: number;
  skippedCount: number;
};

export async function categorizeTransactions(
  userId: string,
  itemId: number,
  opts: {
    recategorizeCatchAll?: boolean;
    recategorizeAll?: boolean;
    transactionIds?: number[];
  } = {},
): Promise<CategorizeTransactionsResult> {
  const { db } = await import("../db");

  const { allowedLeafCats } = await getAllowedLeafCats(userId);
  if (allowedLeafCats.length === 0) {
    return { requestedCount: 0, updatedCount: 0, skippedCount: 0 };
  }

  const categoryByNormalizedName = new Map<string, number>();
  const categoryByCompactName = new Map<string, number>();
  for (const cat of allowedLeafCats) {
    const key = normalizeName(cat.name);
    if (!categoryByNormalizedName.has(key)) {
      categoryByNormalizedName.set(key, cat.id);
    }

    // Model responses sometimes split words (e.g. "Resta urants").
    // Compact keys make matching resilient without broad fuzzy logic.
    const compactKey = key.replace(/[^a-z0-9]/g, "");
    if (!categoryByCompactName.has(compactKey)) {
      categoryByCompactName.set(compactKey, cat.id);
    }
  }

  const accs = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountIds = accs.map((a) => a.id);
  if (accountIds.length === 0) {
    return { requestedCount: 0, updatedCount: 0, skippedCount: 0 };
  }

  const itemTransactions = await db.query.transactions.findMany({
    where: inArray(transactions.accountId, accountIds),
    with: { category: true },
  });

  const selectedIds = opts.transactionIds?.length ? new Set(opts.transactionIds) : null;
  const selectedTransactionCount = selectedIds
    ? itemTransactions.filter((tx) => selectedIds.has(tx.id)).length
    : null;

  const targets = itemTransactions.filter((tx) => {
    if (tx.transactionType !== "regular") return false;
    if (selectedIds) return selectedIds.has(tx.id);
    if (opts.recategorizeAll) return true;
    if (tx.categoryId == null) return true;
    if (!opts.recategorizeCatchAll) return false;
    return tx.category?.name ? isCatchAllCategory(tx.category.name) : false;
  });
  if (targets.length === 0) {
    return { requestedCount: 0, updatedCount: 0, skippedCount: 0 };
  }
  if (selectedTransactionCount !== null && selectedTransactionCount !== targets.length) {
    console.log(
      [
        "[categorize] selected transaction summary",
        `  itemId: ${itemId}`,
        `  selected: ${selectedTransactionCount}`,
        `  modelRows: ${targets.length}`,
        `  skippedAlreadyTyped: ${selectedTransactionCount - targets.length}`,
      ].join("\n"),
    );
  }

  const validIds = new Set(allowedLeafCats.map((c) => c.id));
  const CHUNK = 100;
  const compact = (value: string) => normalizeName(value).replace(/[^a-z0-9]/g, "");
  const resolveCategorization = (
    tx: (typeof targets)[number],
    proposedCategoryName?: string,
  ): { categoryId: number | null; transactionType: "regular" | "income" | "transfer" } | null => {
    if (proposedCategoryName && (isTransferCategoryName(proposedCategoryName) || compact(proposedCategoryName) === "transfer")) {
      return { categoryId: null, transactionType: "transfer" };
    }

    if (proposedCategoryName && (isIncomeCategoryName(proposedCategoryName) || compact(proposedCategoryName) === "income")) {
      return { categoryId: null, transactionType: "income" };
    }

    const proposedCategoryId = proposedCategoryName
      ? categoryByNormalizedName.get(normalizeName(proposedCategoryName))
      : undefined;

    const proposedCompactCategoryId =
      proposedCategoryName && !proposedCategoryId
        ? categoryByCompactName.get(compact(proposedCategoryName))
        : undefined;

    if (proposedCategoryId && validIds.has(proposedCategoryId)) {
      return { categoryId: proposedCategoryId, transactionType: "regular" };
    }

    if (proposedCompactCategoryId && validIds.has(proposedCompactCategoryId)) {
      return { categoryId: proposedCompactCategoryId, transactionType: "regular" };
    }

    if (tx.categoryId != null && validIds.has(tx.categoryId)) {
      return { categoryId: tx.categoryId, transactionType: "regular" };
    }

    return null;
  };

  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    const updates: Array<{
      txId: number;
      categoryId: number | null;
      transactionType: "regular" | "income" | "transfer";
    }> = [];
    const missingTransactions: string[] = [];
    const invalidCategories: Array<{ merchant: string; category: string }> = [];
    const { byTransactionId } = await categorizeBatch(batch, allowedLeafCats);

    for (const tx of batch) {
      const proposedCategoryName = byTransactionId.get(tx.id);
      const categorization = resolveCategorization(tx, proposedCategoryName);

      if (categorization == null) {
        if (!proposedCategoryName) {
          missingTransactions.push(`${tx.id} (${tx.merchantName})`);
        } else {
          invalidCategories.push({
            merchant: `${tx.id} (${tx.merchantName})`,
            category: proposedCategoryName,
          });
        }
        continue;
      }

      updates.push({ txId: tx.id, ...categorization });
    }

    if (missingTransactions.length > 0 || invalidCategories.length > 0) {
      skippedCount += missingTransactions.length + invalidCategories.length;
      console.warn(
        [
          "[categorize] partial batch skip",
          `  itemId: ${itemId}`,
          `  missing: ${missingTransactions.length}`,
          `  invalid: ${invalidCategories.length}`,
          missingTransactions.length > 0
            ? `  Missing transactions: ${missingTransactions.slice(0, 12).join(", ")}`
            : null,
          invalidCategories.length > 0
            ? `  Invalid categories: ${invalidCategories
                .slice(0, 12)
                .map((item) => `${item.merchant} -> ${item.category}`)
                .join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    for (const update of updates) {
      await db
        .update(transactions)
        .set({
          categoryId: update.categoryId,
          transactionType: update.transactionType,
        })
        .where(eq(transactions.id, update.txId));
      updatedCount += 1;
    }
  }

  return {
    requestedCount: targets.length,
    updatedCount,
    skippedCount,
  };
}
