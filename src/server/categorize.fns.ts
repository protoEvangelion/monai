import { transactions, accounts } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  isCatchAllCategory,
  pickHeuristicCategoryId,
  normalizeName,
  categorizeBatch,
  getAllowedLeafCats,
} from "./categorize.utils";

export async function categorizeTransactions(
  userId: string,
  itemId: number,
  opts: {
    recategorizeCatchAll?: boolean;
    recategorizeAll?: boolean;
    transactionIds?: number[];
  } = {},
) {
  const { db } = await import("../db");

  const { allCats, allowedLeafCats } = await getAllowedLeafCats(userId);
  if (allowedLeafCats.length === 0) return;

  const categoryByNormalizedName = new Map<string, number>();
  for (const cat of allowedLeafCats) {
    const key = normalizeName(cat.name);
    if (!categoryByNormalizedName.has(key)) {
      categoryByNormalizedName.set(key, cat.id);
    }
  }

  const accs = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountIds = accs.map((a) => a.id);
  if (accountIds.length === 0) return;

  const itemTransactions = await db.query.transactions.findMany({
    where: inArray(transactions.accountId, accountIds),
    with: { category: true },
  });

  const selectedIds = opts.transactionIds?.length
    ? new Set(opts.transactionIds)
    : null;

  const targets = itemTransactions.filter((tx) => {
    if (selectedIds) return selectedIds.has(tx.id);
    if (opts.recategorizeAll) return true;
    if (tx.categoryId == null) return true;
    if (!opts.recategorizeCatchAll) return false;
    return tx.category?.name ? isCatchAllCategory(tx.category.name) : false;
  });
  if (targets.length === 0) return;

  const validIds = new Set(allowedLeafCats.map((c) => c.id));
  const CHUNK = 100;
  const categoryById = new Map(allCats.map((c) => [c.id, c]));

  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    try {
      const { byMerchant } = await categorizeBatch(batch, allowedLeafCats);

      for (const tx of batch) {
        const merchantKey = normalizeName(tx.merchantName);
        const proposedCategoryName = byMerchant.get(merchantKey);
        const proposedCategoryId = proposedCategoryName
          ? categoryByNormalizedName.get(normalizeName(proposedCategoryName))
          : undefined;

        const categoryId =
          proposedCategoryId && validIds.has(proposedCategoryId)
            ? proposedCategoryId
            : tx.categoryId != null
              ? tx.categoryId
              : pickHeuristicCategoryId(tx, allowedLeafCats);

        await db
          .update(transactions)
          .set({ categoryId })
          .where(eq(transactions.id, tx.id));
      }
    } catch (err) {
      console.error(
        "Categorization batch failed, using heuristic category:",
        err,
      );
      for (const tx of batch) {
        const prevCategoryName = tx.category?.name ?? "Uncategorized";
        const categoryId =
          tx.categoryId != null
            ? tx.categoryId
            : pickHeuristicCategoryId(tx, allowedLeafCats);
        const nextCategoryName =
          categoryById.get(categoryId)?.name ?? String(categoryId);

        await db
          .update(transactions)
          .set({ categoryId })
          .where(eq(transactions.id, tx.id));

        console.log(
          "[categorize]",
          JSON.stringify({
            txId: tx.id,
            merchant: tx.merchantName,
            amount: tx.amount,
            previousCategory: prevCategoryName,
            nextCategory: nextCategoryName,
            reason:
              tx.categoryId != null
                ? "preserved existing category after model failure"
                : "heuristic fallback after model failure",
            model: "none",
          }),
        );
      }
    }
  }
}
