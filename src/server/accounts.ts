import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { plaidItems } from '../db/schema'
import { eq } from 'drizzle-orm'

const isDebtType = (type: string) => type === 'credit' || type === 'loan'

const toMonthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

const monthKey = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

const last24MonthKeys = (): string[] => {
  const now = new Date()
  return Array.from({ length: 24 }, (_, i) =>
    monthKey(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (23 - i), 1)).getUTCFullYear(),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (23 - i), 1)).getUTCMonth(),
    )
  )
}

const keyToDate = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

type MonthBucket = { assets: number; debts: number }

export const getAccounts = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  return items.flatMap(item => item.accounts)
})

export const getConnections = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  return items.map(item => ({
    id: item.id,
    institutionName: item.institutionName,
    lastSyncedAt: item.lastSyncedAt,
    accountCount: item.accounts.length,
  }))
})

export const getNetWorthHistory = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: { with: { historicalBalances: true } } },
  })

  const monthKeys = last24MonthKeys()
  const validKeys = new Set(monthKeys)

  // Flatten all accounts across all items then reduce into monthly buckets
  const totals = items
    .flatMap(item => item.accounts)
    .reduce<Map<string, MonthBucket>>((acc, account) => {
      const latestForMonth = account.historicalBalances.reduce<Map<string, { date: number; balance: number }>>(
        (map, point) => {
          const d = new Date(point.date)
          const key = toMonthKey(d)
          if (!validKeys.has(key)) return map
          const prev = map.get(key)
          if (!prev || d.getTime() > prev.date) map.set(key, { date: d.getTime(), balance: point.balance })
          return map
        },
        new Map()
      )

      latestForMonth.forEach(({ balance }, key) => {
        const bucket = acc.get(key) ?? { assets: 0, debts: 0 }
        if (isDebtType(account.type)) bucket.debts += Math.abs(balance)
        else bucket.assets += balance
        acc.set(key, bucket)
      })

      return acc
    }, new Map(monthKeys.map(k => [k, { assets: 0, debts: 0 }])))

  return monthKeys.map(key => {
    const { assets, debts } = totals.get(key) ?? { assets: 0, debts: 0 }
    const date = keyToDate(key)
    return {
      monthKey: key,
      date,
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      assets: Math.round(assets),
      debts: Math.round(debts),
      netWorth: Math.round(assets - debts),
    }
  })
})
