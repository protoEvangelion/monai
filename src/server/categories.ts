import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { categories, transactions, accounts, plaidItems } from '../db/schema'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { match } from 'ts-pattern'

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

// Old group names that should be merged into a canonical default group name.
const GROUP_ALIASES: Record<string, string> = {
  'Food': 'Food & Dining',
}

type DbCategory = { id: number; name: string; parentId: number | null; userId: string; icon: string | null; budgetAmount: number }

const groupByParentName = (cats: DbCategory[]) =>
  cats.reduce((map, cat) => {
    if (cat.parentId !== null) return map
    return map.set(cat.name, [...(map.get(cat.name) ?? []), cat])
  }, new Map<string, DbCategory[]>())

async function mergeAliasGroups(db: { update: Function; delete: Function; query: unknown }, existing: DbCategory[]) {
  await Promise.all(
    Object.entries(GROUP_ALIASES).map(async ([alias, canonical]) => {
      const aliasGroup = existing.find(c => c.parentId === null && c.name === alias)
      const canonicalGroup = existing.find(c => c.parentId === null && c.name === canonical)
      if (!aliasGroup || !canonicalGroup) return

      const aliasChildren = existing.filter(c => c.parentId === aliasGroup.id)
      const canonicalChildren = existing.filter(c => c.parentId === canonicalGroup.id)

      await Promise.all(
        aliasChildren.map(child => {
          const match = canonicalChildren.find(c => c.name === child.name)
          return match
            ? db.update(transactions).set({ categoryId: match.id }).where(eq(transactions.categoryId, child.id))
                .then(() => db.delete(categories).where(eq(categories.id, child.id)))
            : db.update(categories).set({ parentId: canonicalGroup.id }).where(eq(categories.id, child.id))
        })
      )
      await db.delete(categories).where(eq(categories.id, aliasGroup.id))
    })
  )
}

async function dedupRootGroups(db: { update: Function; delete: Function; query: unknown }, existing: DbCategory[]) {
  const rootByName = groupByParentName(existing)

  await Promise.all(
    [...rootByName.entries()]
      .filter(([, roots]) => roots.length >= 2)
      .map(async ([, dupRoots]) => {
        const [keep, ...toRemove] = dupRoots.slice().sort((a, b) => a.id - b.id)
        const keepChildren = existing.filter(c => c.parentId === keep.id)

        await Promise.all(
          toRemove.map(async (dupRoot) => {
            const dupChildren = existing.filter(c => c.parentId === dupRoot.id)

            await Promise.all(
              dupChildren.map(child => {
                const sameName = keepChildren.find(c => c.name === child.name)
                return match(sameName)
                  .when((s): s is NonNullable<typeof s> => s != null, (matched) =>
                    db.update(transactions).set({ categoryId: matched.id }).where(eq(transactions.categoryId, child.id))
                      .then(() => db.delete(categories).where(eq(categories.id, child.id)))
                  )
                  .otherwise(() =>
                    db.update(categories).set({ parentId: keep.id }).where(eq(categories.id, child.id))
                      .then(() => keepChildren.push({ ...child, parentId: keep.id }))
                  )
              })
            )

            await db.delete(categories).where(eq(categories.id, dupRoot.id))
          })
        )
      })
  )
}

async function seedMissingDefaults(db: { insert: Function; query: { categories: { findFirst: Function } } }, userId: string) {
  await Promise.all(
    DEFAULT_CATEGORIES.map(async (group) => {
      let parent = await db.query.categories.findFirst({
        where: and(eq(categories.userId, userId), isNull(categories.parentId), eq(categories.name, group.name)),
      })

      if (!parent) {
        ;[parent] = await db
          .insert(categories)
          .values({ userId, name: group.name, icon: group.icon, budgetAmount: 0 })
          .returning()
      }

      await Promise.all(
        group.children.map(async (child) => {
          const exists = await db.query.categories.findFirst({
            where: and(eq(categories.userId, userId), eq(categories.parentId, parent.id), eq(categories.name, child.name)),
          })
          if (!exists) {
            await db.insert(categories).values({ userId, name: child.name, icon: child.icon, parentId: parent.id, budgetAmount: 0 })
          }
        })
      )
    })
  )
}

export async function seedDefaultCategories(userId: string) {
  const { db } = await import('../db')
  const existing = await db.query.categories.findMany({ where: eq(categories.userId, userId) })

  await mergeAliasGroups(db, existing)

  const refreshed = await db.query.categories.findMany({ where: eq(categories.userId, userId) })
  await dedupRootGroups(db, refreshed)

  await seedMissingDefaults(db, userId)
}

export const getCategoriesWithSpending = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  await seedDefaultCategories(userId)

  const [all, userAccounts] = await Promise.all([
    db.query.categories.findMany({ where: eq(categories.userId, userId), with: { children: true } }),
    db.select({ id: accounts.id }).from(accounts)
      .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
      .where(eq(plaidItems.userId, userId)),
  ])

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

