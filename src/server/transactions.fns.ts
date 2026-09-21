import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { transactions, plaidItems, categories, accounts, categorizationRules } from "../db/schema";
import { eq, desc, inArray, and, gte, lte, like, not, or, sql, type SQL } from "drizzle-orm";
import { parseCategoryFilter } from "../ui/features/transactions/transactions.utils";

type TransactionType = "regular" | "income" | "transfer";
export type TransactionReviewStatus = "all" | "not-reviewed" | "reviewed";
export type TransactionsPageQuery = {
  amountMax?: string;
  amountMin?: string;
  categoryFilter?: string;
  dateEnd?: string;
  dateStart?: string;
  pageIndex?: number;
  pageSize?: number;
  reviewStatus?: TransactionReviewStatus;
  search?: string;
};

async function getUserAccountIds(db: typeof import("../db").db, userId: string) {
  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  });

  return userPlaidItems.flatMap((item) => item.accounts.map((acc) => acc.id));
}

/** Exclude Plaid parent rows that have been split into child legs. */
function excludeSplitParentsSql(): SQL {
  return sql`${transactions.id} NOT IN (
    SELECT DISTINCT split_parent_id FROM transactions WHERE split_parent_id IS NOT NULL
  )`;
}

function cents(value: number) {
  return Math.round(value * 100);
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
    where: and(inArray(transactions.accountId, accountIds), excludeSplitParentsSql()),
    orderBy: [desc(transactions.date)],
    with: {
      account: true,
      category: true,
      rule: true,
    },
  });

  return allTransactions;
});

function normalizeTransactionsPageQuery(query: TransactionsPageQuery = {}) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 100, 1), 250);
  return {
    amountMax: query.amountMax?.trim() ?? "",
    amountMin: query.amountMin?.trim() ?? "",
    categoryFilter: query.categoryFilter ?? "all",
    dateEnd: query.dateEnd?.trim() ?? "",
    dateStart: query.dateStart?.trim() ?? "",
    pageIndex: Math.max(Number(query.pageIndex) || 0, 0),
    pageSize,
    reviewStatus: query.reviewStatus ?? "all",
    search: query.search?.trim() ?? "",
  };
}

function dateBoundary(value: string, endOfDay = false) {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
}

function categoryFilterSql(categoryFilter: string): SQL | undefined {
  const { isExclude, key } = parseCategoryFilter(categoryFilter);
  if (key === "all") return undefined;

  let includeCondition: SQL | undefined;
  if (key === "income") includeCondition = eq(transactions.transactionType, "income");
  else if (key === "transfer") includeCondition = eq(transactions.transactionType, "transfer");
  else if (key === "uncategorized") {
    includeCondition = and(
      eq(transactions.transactionType, "regular"),
      sql`${transactions.categoryId} IS NULL`,
    );
  } else if (key.startsWith("cat:")) {
    const categoryId = Number(key.slice(4));
    if (Number.isFinite(categoryId)) {
      includeCondition = and(
        eq(transactions.transactionType, "regular"),
        eq(transactions.categoryId, categoryId),
      );
    }
  }

  if (!includeCondition) return undefined;
  return isExclude ? not(includeCondition) : includeCondition;
}

function transactionPageWhere({
  accountIds,
  query,
}: {
  accountIds: number[];
  query: ReturnType<typeof normalizeTransactionsPageQuery>;
}) {
  const conditions: (SQL | undefined)[] = [
    inArray(transactions.accountId, accountIds),
    excludeSplitParentsSql(),
  ];

  if (query.reviewStatus === "not-reviewed") conditions.push(eq(transactions.isReviewed, false));
  if (query.reviewStatus === "reviewed") conditions.push(eq(transactions.isReviewed, true));

  const categoryFilterCondition = categoryFilterSql(query.categoryFilter);
  if (categoryFilterCondition) conditions.push(categoryFilterCondition);

  if (query.dateStart) conditions.push(gte(transactions.date, dateBoundary(query.dateStart)));
  if (query.dateEnd) conditions.push(lte(transactions.date, dateBoundary(query.dateEnd, true)));

  const min = query.amountMin ? Number(query.amountMin) : null;
  const max = query.amountMax ? Number(query.amountMax) : null;
  if (min !== null && Number.isFinite(min)) conditions.push(sql`abs(${transactions.amount}) >= ${min}`);
  if (max !== null && Number.isFinite(max)) conditions.push(sql`abs(${transactions.amount}) <= ${max}`);

  if (query.search) {
    const pattern = `%${query.search}%`;
    const typeMatches: SQL[] = [];
    for (const type of ["regular", "income", "transfer"] as const) {
      if (type.includes(query.search.toLowerCase())) {
        typeMatches.push(eq(transactions.transactionType, type));
      }
    }
    conditions.push(
      or(
        like(transactions.name, pattern),
        like(transactions.merchantName, pattern),
        like(transactions.location, pattern),
        like(transactions.note, pattern),
        like(categories.name, pattern),
        ...typeMatches,
      ),
    );
  }

  return and(...conditions);
}

export const getTransactionsPage = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = normalizeTransactionsPageQuery(((ctx as any).data ?? {}) as TransactionsPageQuery);
  const { db } = await import("../db");
  const accountIds = await getUserAccountIds(db, userId);

  if (accountIds.length === 0) {
    return { rows: [], pageIndex: query.pageIndex, pageSize: query.pageSize, total: 0 };
  }

  const where = transactionPageWhere({ accountIds, query });
  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where);

  const rows = await db
    .select({
      account: accounts,
      category: categories,
      rule: categorizationRules,
      tx: transactions,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(categorizationRules, eq(transactions.ruleId, categorizationRules.id))
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(query.pageSize)
    .offset(query.pageIndex * query.pageSize);

  return {
    rows: rows.map(({ account, category, rule, tx }) => ({
      ...tx,
      account,
      category,
      rule: rule
        ? { id: rule.id, pattern: rule.pattern }
        : null,
    })),
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    total,
  };
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

export const setTransactionsReviewed = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, isReviewed } = (ctx as any).data as { ids: number[]; isReviewed: boolean };
  if (!ids.length) return;

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, ids);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({ isReviewed })
    .where(inArray(transactions.id, ownedIds));
});

export const updateTransactionsDate = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, date } = (ctx as any).data as { ids: number[]; date: string };
  if (!ids.length) return;

  const parsedDate = dateBoundary(date);
  if (Number.isNaN(parsedDate.getTime())) throw new Error("Invalid date");

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, ids);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({ date: parsedDate })
    .where(inArray(transactions.id, ownedIds));
});

export const updateTransactionNote = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, note } = (ctx as any).data as { id: number; note: string };
  if (!Number.isInteger(id)) throw new Error("Invalid transaction");
  if (typeof note !== "string") throw new Error("Invalid note");

  const trimmedNote = note.trim();
  if (trimmedNote.length > 1_000) throw new Error("Note must be 1,000 characters or fewer");

  const { db } = await import("../db");
  const ownedIds = await assertTransactionsOwned(db, userId, [id]);
  if (!ownedIds.length) return;

  await db
    .update(transactions)
    .set({ note: trimmedNote || null })
    .where(eq(transactions.id, id));
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
    .set({ categoryId, transactionType: "regular", ruleId: null })
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
      ruleId: null,
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
      ruleId: null,
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
      ruleId: null,
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
    .set({ categoryId, transactionType: "regular", ruleId: null })
    .where(inArray(transactions.id, ownedIds));
});

export const splitTransaction = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, splits } = (ctx as any).data as {
    id: number;
    splits: Array<{ amount: number; categoryId: number; note?: string | null }>;
  };

  if (!Number.isInteger(id)) throw new Error("Invalid transaction");
  if (!Array.isArray(splits) || splits.length < 2) {
    throw new Error("Split into at least two legs");
  }

  const { db } = await import("../db");
  await assertTransactionsOwned(db, userId, [id]);

  const parent = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
  if (!parent) throw new Error("Transaction not found");
  if (parent.splitParentId != null) throw new Error("Cannot split a split leg");
  if (parent.transactionType === "transfer") throw new Error("Cannot split a transfer");

  const existingChildren = await db.query.transactions.findFirst({
    where: eq(transactions.splitParentId, id),
    columns: { id: true },
  });
  if (existingChildren) throw new Error("Transaction is already split");

  const categoryIds = [...new Set(splits.map((split) => split.categoryId))];
  const cats = await db.query.categories.findMany({
    where: and(inArray(categories.id, categoryIds), eq(categories.userId, userId)),
  });
  if (cats.length !== categoryIds.length) throw new Error("Category not found");
  if (cats.some((cat) => cat.parentId === null)) {
    throw new Error("Split legs require leaf categories");
  }

  const parentSign = Math.sign(parent.amount) || 1;
  let splitCentsTotal = 0;
  for (const split of splits) {
    if (!Number.isFinite(split.amount) || split.amount === 0) {
      throw new Error("Each split needs a non-zero amount");
    }
    if (Math.sign(split.amount) !== parentSign) {
      throw new Error("Split amounts must match the transaction sign");
    }
    if (!Number.isInteger(split.categoryId)) throw new Error("Invalid category");
    splitCentsTotal += cents(split.amount);
  }

  if (splitCentsTotal !== cents(parent.amount)) {
    throw new Error("Split amounts must sum to the original amount");
  }

  await db.insert(transactions).values(
    splits.map((split) => ({
      accountId: parent.accountId,
      categoryId: split.categoryId,
      plaidTransactionId: null,
      amount: split.amount,
      date: parent.date,
      datetime: parent.datetime,
      name: parent.name,
      merchantName: parent.merchantName,
      location: parent.location,
      note: split.note?.trim() || parent.note,
      isReviewed: true,
      isRecurring: parent.isRecurring,
      isPending: parent.isPending,
      splitParentId: parent.id,
      transactionType: parent.transactionType === "income" ? ("income" as const) : ("regular" as const),
    })),
  );

  await db
    .update(transactions)
    .set({ categoryId: null, isReviewed: true })
    .where(eq(transactions.id, parent.id));

  return { ok: true as const, childCount: splits.length };
});
