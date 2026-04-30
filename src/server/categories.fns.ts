import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { categories, transactions, accounts, plaidItems } from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { seedDefaultCategories } from "./categories.seed";

export const getCategoriesWithSpending = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  await seedDefaultCategories(userId);

  const [all, userAccounts] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.userId, userId),
      with: { children: true },
    }),
    db
      .select({ id: accounts.id })
      .from(accounts)
      .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
      .where(eq(plaidItems.userId, userId)),
  ]);

  const accountIds = userAccounts.map((a) => a.id);

  const spending =
    accountIds.length > 0
      ? await db
          .select({
            categoryId: transactions.categoryId,
            total: sql<number>`CAST(COALESCE(SUM(${transactions.amount}), 0) AS REAL)`,
            txCount: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)`,
          })
          .from(transactions)
          .where(inArray(transactions.accountId, accountIds))
          .groupBy(transactions.categoryId)
      : [];

  const spendMap = new Map(spending.map((s) => [s.categoryId, s]));

  return all
    .filter((c) => c.parentId === null)
    .map((group) => ({
      ...group,
      children: group.children.map((child) => ({
        ...child,
        spent: spendMap.get(child.id)?.total ?? 0,
        txCount: spendMap.get(child.id)?.txCount ?? 0,
      })),
    }));
});

export const getCategories = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  await seedDefaultCategories(userId);

  const all = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
    with: { children: true },
  });

  return all.filter((c) => c.parentId === null);
});

export const createCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { name, icon, budgetAmount, parentId } = (ctx as any).data as {
    name: string;
    icon: string;
    budgetAmount: number;
    parentId?: number | null;
  };

  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name,
      icon,
      budgetAmount,
      parentId: parentId ?? null,
    })
    .returning({ id: categories.id });

  return created;
});

export const updateCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, name, icon, budgetAmount } = (ctx as any).data as {
    id: number;
    name: string;
    icon: string;
    budgetAmount: number;
  };

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });
  if (!cat || cat.userId !== userId) throw new Error("Not found");

  await db
    .update(categories)
    .set({ name, icon, budgetAmount })
    .where(eq(categories.id, id));
});

export const deleteCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number };

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, id),
    with: { children: true },
  });
  if (!cat || cat.userId !== userId) throw new Error("Not found");

  if (cat.parentId === null && cat.children.length > 0) {
    const childIds = cat.children.map((c) => c.id);
    await db
      .update(transactions)
      .set({ categoryId: null })
      .where(inArray(transactions.categoryId, childIds));
    await db.delete(categories).where(inArray(categories.id, childIds));
  } else {
    await db
      .update(transactions)
      .set({ categoryId: null })
      .where(eq(transactions.categoryId, id));
  }

  await db.delete(categories).where(eq(categories.id, id));
});
