import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { categories, transactions, accounts, plaidItems } from '../db/schema'
import { eq, inArray, sql } from 'drizzle-orm'

type DefaultGroup = {
  name: string
  icon: string
  children: Array<{ name: string; icon: string }>
}

const DEFAULT_CATEGORIES: DefaultGroup[] = [
  {
    name: 'Food & Dining', icon: '🍽️',
    children: [
      { name: 'Groceries', icon: '🛒' },
      { name: 'Restaurants', icon: '🍴' },
      { name: 'Coffee & Drinks', icon: '☕' },
      { name: 'Fast Food', icon: '🍔' },
    ],
  },
  {
    name: 'Home', icon: '🏠',
    children: [
      { name: 'Rent / Mortgage', icon: '🏡' },
      { name: 'Utilities', icon: '💡' },
      { name: 'Internet & Phone', icon: '📶' },
      { name: 'Home Maintenance', icon: '🔧' },
    ],
  },
  {
    name: 'Transportation', icon: '🚗',
    children: [
      { name: 'Gas', icon: '⛽' },
      { name: 'Parking', icon: '🅿️' },
      { name: 'Public Transit', icon: '🚌' },
      { name: 'Rideshare', icon: '🚕' },
      { name: 'Car Insurance', icon: '🛡️' },
      { name: 'Car Maintenance', icon: '🔩' },
    ],
  },
  {
    name: 'Shopping', icon: '🛍️',
    children: [
      { name: 'Clothing', icon: '👕' },
      { name: 'Electronics', icon: '💻' },
      { name: 'Online Shopping', icon: '📦' },
      { name: 'Home Goods', icon: '🏪' },
    ],
  },
  {
    name: 'Entertainment', icon: '🎬',
    children: [
      { name: 'Streaming', icon: '📺' },
      { name: 'Movies & Shows', icon: '🎥' },
      { name: 'Games', icon: '🎮' },
      { name: 'Concerts & Events', icon: '🎵' },
    ],
  },
  {
    name: 'Health & Fitness', icon: '💪',
    children: [
      { name: 'Gym & Fitness', icon: '🏋️' },
      { name: 'Medical', icon: '🏥' },
      { name: 'Pharmacy', icon: '💊' },
      { name: 'Mental Health', icon: '🧠' },
    ],
  },
  {
    name: 'Travel', icon: '✈️',
    children: [
      { name: 'Flights', icon: '✈️' },
      { name: 'Hotels', icon: '🏨' },
      { name: 'Vacation Activities', icon: '🏖️' },
    ],
  },
  {
    name: 'Income', icon: '💰',
    children: [
      { name: 'Paycheck', icon: '💵' },
      { name: 'Freelance', icon: '💼' },
      { name: 'Interest & Dividends', icon: '📈' },
      { name: 'Rental Income', icon: '🏘️' },
    ],
  },
  {
    name: 'Personal Care', icon: '🪥',
    children: [
      { name: 'Haircut & Beauty', icon: '💇' },
      { name: 'Spa & Wellness', icon: '🧖' },
    ],
  },
  {
    name: 'Education', icon: '📚',
    children: [
      { name: 'Tuition', icon: '🎓' },
      { name: 'Books & Courses', icon: '📖' },
    ],
  },
  {
    name: 'Financial', icon: '🏦',
    children: [
      { name: 'Credit Card Payment', icon: '💳' },
      { name: 'Loan Payment', icon: '📋' },
      { name: 'Savings Transfer', icon: '🏦' },
      { name: 'Fees & Charges', icon: '⚠️' },
    ],
  },
  {
    name: 'Miscellaneous', icon: '📦',
    children: [
      { name: 'Gifts', icon: '🎁' },
      { name: 'Donations', icon: '🤝' },
      { name: 'Other', icon: '❓' },
    ],
  },
]

export async function seedDefaultCategories(userId: string) {
  const { db } = await import('../db')
  const existing = await db.query.categories.findFirst({
    where: eq(categories.userId, userId),
  })
  if (existing) return

  for (const group of DEFAULT_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({ userId, name: group.name, icon: group.icon, budgetAmount: 0 })
      .returning()

    for (const child of group.children) {
      await db.insert(categories).values({
        userId,
        name: child.name,
        icon: child.icon,
        parentId: parent.id,
        budgetAmount: 0,
      })
    }
  }
}

export const getCategoriesWithSpending = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  await seedDefaultCategories(userId)

  const all = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
    with: { children: true },
  })

  const userAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
    .where(eq(plaidItems.userId, userId))

  const accountIds = userAccounts.map(a => a.id)

  const spending = accountIds.length > 0
    ? await db
        .select({
          categoryId: transactions.categoryId,
          total: sql<number>`CAST(COALESCE(SUM(${transactions.amount}), 0) AS REAL)`,
          txCount: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)`,
        })
        .from(transactions)
        .where(inArray(transactions.accountId, accountIds))
        .groupBy(transactions.categoryId)
    : []

  const spendMap = new Map(spending.map(s => [s.categoryId, s]))

  return all
    .filter(c => c.parentId === null)
    .map(group => ({
      ...group,
      children: group.children.map(child => ({
        ...child,
        spent: spendMap.get(child.id)?.total ?? 0,
        txCount: spendMap.get(child.id)?.txCount ?? 0,
      })),
    }))
})

export const getCategories = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  await seedDefaultCategories(userId)

  const all = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
    with: { children: true },
  })

  return all.filter(c => c.parentId === null)
})

export const createCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { name, icon, budgetAmount, parentId } = (ctx as any).data as {
    name: string
    icon: string
    budgetAmount: number
    parentId?: number | null
  }

  const [created] = await db.insert(categories).values({
    userId,
    name,
    icon,
    budgetAmount,
    parentId: parentId ?? null,
  }).returning({ id: categories.id })

  return created
})

export const updateCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id, name, icon, budgetAmount } = (ctx as any).data as {
    id: number
    name: string
    icon: string
    budgetAmount: number
  }

  const cat = await db.query.categories.findFirst({ where: eq(categories.id, id) })
  if (!cat || cat.userId !== userId) throw new Error('Not found')

  await db.update(categories).set({ name, icon, budgetAmount }).where(eq(categories.id, id))
})

export const deleteCategory = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number }

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, id),
    with: { children: true },
  })
  if (!cat || cat.userId !== userId) throw new Error('Not found')

  if (cat.parentId === null && cat.children.length > 0) {
    const childIds = cat.children.map(c => c.id)
    await db.update(transactions).set({ categoryId: null }).where(inArray(transactions.categoryId, childIds))
    await db.delete(categories).where(inArray(categories.id, childIds))
  } else {
    await db.update(transactions).set({ categoryId: null }).where(eq(transactions.categoryId, id))
  }

  await db.delete(categories).where(eq(categories.id, id))
})
