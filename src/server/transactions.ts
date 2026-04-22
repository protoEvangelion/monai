import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { transactions, plaidItems, categories } from '../db/schema'
import { eq, desc, inArray, and } from 'drizzle-orm'

export const getTransactions = createServerFn().handler(async () => {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  const accountIds = userPlaidItems.flatMap(item => item.accounts.map(acc => acc.id))

  if (accountIds.length === 0) return []

  const allTransactions = await db.query.transactions.findMany({
    where: inArray(transactions.accountId, accountIds),
    orderBy: [desc(transactions.date)],
    with: {
      account: true,
      category: true,
    }
  })

  return allTransactions
})

export const markTransactionsReviewed = createServerFn().handler(async (ctx) => {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids } = (ctx as any).data as { ids: number[] }
  if (!ids.length) return

  const { db } = await import('../db')

  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })
  const accountIds = userPlaidItems.flatMap(item => item.accounts.map(acc => acc.id))

  await db
    .update(transactions)
    .set({ isReviewed: true })
    .where(and(inArray(transactions.id, ids), inArray(transactions.accountId, accountIds)))
})

export const updateTransactionCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, categoryId } = (ctx as any).data as { id: number; categoryId: number | null }

  const { db } = await import('../db')

  const userPlaidItems = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })
  const accountIds = userPlaidItems.flatMap(item => item.accounts.map(acc => acc.id))

  if (categoryId !== null) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) })
    if (!cat || cat.userId !== userId) throw new Error('Category not found')
  }

  await db
    .update(transactions)
    .set({ categoryId })
    .where(and(eq(transactions.id, id), inArray(transactions.accountId, accountIds)))
})
