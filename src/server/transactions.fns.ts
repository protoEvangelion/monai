import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { transactions, plaidItems, categories } from "../db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";

type TransactionType = "regular" | "income" | "transfer";

async function getUserAccountIds(db: typeof import("../db").db, userId: string) {
  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });

  return userPlaidItems.flatMap((item) => item.accounts.map((acc) => acc.id));
}

async function assertTransactionsOwned(
  db: typeof import("../db").db,
  userId: string,
  ids: number[],
) {
  if (ids.length === 0) return [];

  const accountIds = await getUserAccountIds(db, userId);
  if (accountIds.length === 0) return [];

  const owned = await db.query.transactions.findMany({
    where: and(inArray(transactions.id, ids), inArray(transactions.accountId, accountIds)),
    columns: { id: true },
  });
  const ownedIds = owned.map((tx) => tx.id);
  if (ownedIds.length !== new Set(ids).size) throw new Error("Transaction not found");
  return ownedIds;
}

export const getTransactions = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  const accountIds = await getUserAccountIds(db, userId);

  if (accountIds.length === 0) return [];

  const allTransactions = await db.query.transactions.findMany({
    where: inArray(transactions.accountId, accountIds),
    orderBy: [desc(transactions.date)],
    with: {
      account: true,
      category: true,
    },
  });

  return allTransactions;
});

export const markTransactionsReviewed = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids } = (ctx as any).data as { ids: number[] };
  if (!ids.length) return;

  const { db } = await import("../db");

  const accountIds = await getUserAccountIds(db, userId);

  await db
    .update(transactions)
    .set({ isReviewed: true })
    .where(and(inArray(transactions.id, ids), inArray(transactions.accountId, accountIds)));
});

export const updateTransactionCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, categoryId } = (ctx as any).data as { id: number; categoryId: number | null };

  const { db } = await import("../db");

  const accountIds = await getUserAccountIds(db, userId);

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!cat || cat.userId !== userId) throw new Error("Category not found");
  }

  await db
    .update(transactions)
    .set({ categoryId, transactionType: "regular" })
    .where(and(eq(transactions.id, id), inArray(transactions.accountId, accountIds)));
});

export const createManualTransaction = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { accountId, categoryId, merchantName, amount, date, note, transactionType } = (ctx as any)
    .data as {
    accountId: number;
    categoryId: number | null;
    merchantName: string;
    amount: number;
    date: string;
    note?: string | null;
    transactionType?: "regular" | "income" | "transfer";
  };
  const type = transactionType ?? "regular";

  const trimmedName = merchantName.trim();
  if (!trimmedName) throw new Error("Name is required");
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount is required");

  const { db } = await import("../db");
  const accountIds = await getUserAccountIds(db, userId);
  if (!accountIds.includes(accountId)) throw new Error("Account not found");

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!cat || cat.userId !== userId || cat.parentId === null)
      throw new Error("Category not found");
  }

  const [created] = await db
    .insert(transactions)
    .values({
      accountId,
      categoryId: type === "regular" ? categoryId : null,
      name: trimmedName,
      merchantName: trimmedName,
      amount,
      date: new Date(date),
      note: note?.trim() || null,
      isReviewed: true,
      transactionType: type,
    })
    .returning();

  return created;
});

export const setTransactionsInternalTransfer = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, isInternalTransfer } = (ctx as any).data as {
    ids: number[];
    isInternalTransfer: boolean;
  };
  if (!ids.length) return;

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, ids);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({
      transactionType: isInternalTransfer ? "transfer" : "regular",
      ...(isInternalTransfer ? { categoryId: null } : {}),
    })
    .where(inArray(transactions.id, ownedIds));
});

export const setTransactionType = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, transactionType } = (ctx as any).data as {
    id: number;
    transactionType: TransactionType;
  };
  if (!["regular", "income", "transfer"].includes(transactionType)) {
    throw new Error("Invalid transaction type");
  }

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, [id]);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({
      transactionType,
      ...(transactionType === "regular" ? {} : { categoryId: null }),
    })
    .where(eq(transactions.id, id));
});

export const setTransactionsType = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, transactionType } = (ctx as any).data as {
    ids: number[];
    transactionType: TransactionType;
  };
  if (!ids.length) return;
  if (!["regular", "income", "transfer"].includes(transactionType)) {
    throw new Error("Invalid transaction type");
  }

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, ids);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({
      transactionType,
      ...(transactionType === "regular" ? {} : { categoryId: null }),
    })
    .where(inArray(transactions.id, ownedIds));
});

export const updateTransactionsCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, categoryId } = (ctx as any).data as { ids: number[]; categoryId: number | null };
  if (!ids.length) return;

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, ids);
  if (!ownedIds.length) return;

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!cat || cat.userId !== userId || cat.parentId === null)
      throw new Error("Category not found");
  }

  await db
    .update(transactions)
    .set({ categoryId, transactionType: "regular" })
    .where(inArray(transactions.id, ownedIds));
});
