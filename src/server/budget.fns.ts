import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { categories, monthlyBudgetAllocations, monthlyBudgets } from '../db/schema'
import { getAuthOrDevAuth } from '../lib/devAuth'

function toMonthKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid month')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toCents(value: number) {
  return Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100))
}

async function ensureMonthlyBudget(db: typeof import('../db').db, userId: string, month: string) {
  const existing = await db.query.monthlyBudgets.findFirst({
    where: and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month)),
  })

  if (existing) return existing

  const [created] = await db
    .insert(monthlyBudgets)
    .values({ userId, month })
    .returning()

  return created
}

export const getMonthlyBudgets = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  return db.query.monthlyBudgets.findMany({
    where: eq(monthlyBudgets.userId, userId),
    with: { allocations: true },
  })
})

export const updateExpectedIncome = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { month, expectedIncome } = (ctx as any).data as {
    month: string
    expectedIncome: number
  }

  const monthKey = toMonthKey(month)
  const budget = await ensureMonthlyBudget(db, userId, monthKey)

  await db
    .update(monthlyBudgets)
    .set({
      expectedIncomeCents: toCents(expectedIncome),
      updatedAt: new Date(),
    })
    .where(eq(monthlyBudgets.id, budget.id))
})

export const updateMonthlyAllocation = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { month, categoryId, amount } = (ctx as any).data as {
    month: string
    categoryId: number
    amount: number
  }

  const category = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  })
  if (!category || category.userId !== userId || category.parentId === null) {
    throw new Error('Category not found')
  }

  const monthKey = toMonthKey(month)
  const budget = await ensureMonthlyBudget(db, userId, monthKey)
  const amountCents = toCents(amount)
  const where = and(
    eq(monthlyBudgetAllocations.monthlyBudgetId, budget.id),
    eq(monthlyBudgetAllocations.categoryId, categoryId),
  )

  if (amountCents === 0) {
    await db.delete(monthlyBudgetAllocations).where(where)
    await db.update(monthlyBudgets).set({ updatedAt: new Date() }).where(eq(monthlyBudgets.id, budget.id))
    return
  }

  const existing = await db.query.monthlyBudgetAllocations.findFirst({ where })

  if (existing) {
    await db
      .update(monthlyBudgetAllocations)
      .set({ amountCents })
      .where(eq(monthlyBudgetAllocations.id, existing.id))
  } else {
    await db
      .insert(monthlyBudgetAllocations)
      .values({ monthlyBudgetId: budget.id, categoryId, amountCents })
  }

  await db.update(monthlyBudgets).set({ updatedAt: new Date() }).where(eq(monthlyBudgets.id, budget.id))
})
