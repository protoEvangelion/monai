import { categories } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  isCatchAllCategory,
  isIncomeCategoryName,
  isTransferCategoryName,
  normalizeName,
  type CategoryOption,
  type CategorizeTransactionRow,
} from "../lib/categorize.shared";

export type Category = CategoryOption;
export type Transaction = CategorizeTransactionRow;

export {
  isCatchAllCategory,
  isIncomeCategoryName,
  isTransferCategoryName,
  normalizeName,
  parseTransactionCategoryMap,
  buildCategorizePrompt,
} from "../lib/categorize.shared";

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
