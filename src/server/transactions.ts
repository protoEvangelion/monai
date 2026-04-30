import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { transactions, plaidItems, categories, tags, transactionTags } from '../db/schema'
import { eq, desc, inArray, and, asc } from 'drizzle-orm'

async function getUserAccountIds(db: typeof import('../db').db, userId: string) {
  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  return userPlaidItems.flatMap(item => item.accounts.map(acc => acc.id))
}

async function assertTransactionsOwned(db: typeof import('../db').db, userId: string, ids: number[]) {
  if (ids.length === 0) return []

  const accountIds = await getUserAccountIds(db, userId)
  if (accountIds.length === 0) return []

  const owned = await db.query.transactions.findMany({
    where: and(inArray(transactions.id, ids), inArray(transactions.accountId, accountIds)),
    columns: { id: true },
  })
  const ownedIds = owned.map(tx => tx.id)
  if (ownedIds.length !== new Set(ids).size) throw new Error('Transaction not found')
  return ownedIds
}

export const getTransactions = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const accountIds = await getUserAccountIds(db, userId)

  if (accountIds.length === 0) return []

  const allTransactions = await db.query.transactions.findMany({
    where: inArray(transactions.accountId, accountIds),
    orderBy: [desc(transactions.date)],
    with: {
      account: true,
      category: true,
      tags: {
        with: {
          tag: true,
        },
      },
    }
  })

  return allTransactions
})

export const markTransactionsReviewed = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids } = (ctx as any).data as { ids: number[] }
  if (!ids.length) return

  const { db } = await import('../db')

  const accountIds = await getUserAccountIds(db, userId)

  await db
    .update(transactions)
    .set({ isReviewed: true })
    .where(and(inArray(transactions.id, ids), inArray(transactions.accountId, accountIds)))
})

export const updateTransactionCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, categoryId } = (ctx as any).data as { id: number; categoryId: number | null }

  const { db } = await import('../db')

  const accountIds = await getUserAccountIds(db, userId)

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) })
    if (!cat || cat.userId !== userId) throw new Error('Category not found')
  }

  await db
    .update(transactions)
    .set({ categoryId })
    .where(and(eq(transactions.id, id), inArray(transactions.accountId, accountIds)))
})

export const getTags = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  return db.query.tags.findMany({
    where: eq(tags.userId, userId),
    orderBy: [asc(tags.name)],
  })
})

export const createTag = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { name, color } = (ctx as any).data as { name: string; color: string }
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Tag name is required')

  const { db } = await import('../db')

  const existing = await db.query.tags.findFirst({
    where: and(eq(tags.userId, userId), eq(tags.name, trimmedName)),
  })
  if (existing) return existing

  const [created] = await db
    .insert(tags)
    .values({ userId, name: trimmedName, color })
    .returning()

  return created
})

export const setTransactionsInternalTransfer = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, isInternalTransfer } = (ctx as any).data as { ids: number[]; isInternalTransfer: boolean }
  if (!ids.length) return

  const { db } = await import('../db')
  const ownedIds = await assertTransactionsOwned(db, userId, ids)
  if (!ownedIds.length) return

  await db
    .update(transactions)
    .set({ isInternalTransfer })
    .where(inArray(transactions.id, ownedIds))
})

export const updateTransactionsCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids, categoryId } = (ctx as any).data as { ids: number[]; categoryId: number | null }
  if (!ids.length) return

  const { db } = await import('../db')
  const ownedIds = await assertTransactionsOwned(db, userId, ids)
  if (!ownedIds.length) return

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) })
    if (!cat || cat.userId !== userId || cat.parentId === null) throw new Error('Category not found')
  }

  await db
    .update(transactions)
    .set({ categoryId })
    .where(inArray(transactions.id, ownedIds))
})

export const setTransactionTags = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { transactionId, tagIds } = (ctx as any).data as { transactionId: number; tagIds: number[] }

  const { db } = await import('../db')
  const ownedIds = await assertTransactionsOwned(db, userId, [transactionId])
  if (!ownedIds.length) return

  const uniqueTagIds = [...new Set(tagIds)]
  if (uniqueTagIds.length) {
    const ownedTags = await db.query.tags.findMany({
      where: and(eq(tags.userId, userId), inArray(tags.id, uniqueTagIds)),
      columns: { id: true },
    })
    if (ownedTags.length !== uniqueTagIds.length) throw new Error('Tag not found')
  }

  await db.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId))

  if (uniqueTagIds.length) {
    await db
      .insert(transactionTags)
      .values(uniqueTagIds.map(tagId => ({ transactionId, tagId })))
      .onConflictDoNothing()
  }
})

export const setTagForTransactions = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { transactionIds, tagId, selected } = (ctx as any).data as {
    transactionIds: number[]
    tagId: number
    selected: boolean
  }
  if (!transactionIds.length) return

  const { db } = await import('../db')
  const ownedIds = await assertTransactionsOwned(db, userId, transactionIds)
  if (!ownedIds.length) return

  const tag = await db.query.tags.findFirst({
    where: and(eq(tags.userId, userId), eq(tags.id, tagId)),
  })
  if (!tag) throw new Error('Tag not found')

  if (!selected) {
    await db
      .delete(transactionTags)
      .where(and(inArray(transactionTags.transactionId, ownedIds), eq(transactionTags.tagId, tagId)))
    return
  }

  await db
    .insert(transactionTags)
    .values(ownedIds.map(transactionId => ({ transactionId, tagId })))
    .onConflictDoNothing()
})
