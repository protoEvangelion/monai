import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { plaidItems, accounts, transactions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { seedDefaultCategories } from './categories'
import { categorizeTransactions } from './categorize'

const plaidPost = async (path: string, body: object) => {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = process.env
  if (!PLAID_CLIENT_ID || !PLAID_SECRET || !PLAID_ENV) {
    throw new Error('Missing Plaid env vars — check PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV in .env.local')
  }
  const base = `https://${PLAID_ENV}.plaid.com`
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      ...body,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_message ?? `Plaid error on ${path}`)
  return data
}

export const createLinkToken = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const data = await plaidPost('/link/token/create', {
    client_name: 'Monai',
    user: { client_user_id: userId },
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  })

  return data.link_token as string
})

export const exchangePublicToken = createServerFn()
  .handler(async (ctx) => {
    const { userId } = await getAuthOrDevAuth()
    if (!userId) throw new Error('Unauthorized')

    const { db } = await import('../db')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { publicToken } = (ctx as any).data as { publicToken: string }

    const { access_token, item_id } = await plaidPost('/item/public_token/exchange', {
      public_token: publicToken,
    })

    const [item] = await db
      .insert(plaidItems)
      .values({ itemId: item_id, accessToken: access_token, userId })
      .returning()

    await seedAccounts(access_token, item.id)
    await seedDefaultCategories(userId)
    await syncTransactions(access_token, item.id, userId)
  })

async function seedAccounts(accessToken: string, itemId: number) {
  const { db } = await import('../db')

  const { accounts: plaidAccounts } = await plaidPost('/accounts/get', {
    access_token: accessToken,
  })

  for (const acc of plaidAccounts) {
    await db
      .insert(accounts)
      .values({
        name: acc.name,
        type: mapAccountType(acc.type),
        currentBalance: acc.balances.current ?? 0,
        plaidItemId: itemId,
        plaidAccountId: acc.account_id,
      })
      .onConflictDoUpdate({
        target: accounts.plaidAccountId,
        set: { name: acc.name, currentBalance: acc.balances.current ?? 0 },
      })
  }
}

async function syncTransactions(accessToken: string, itemId: number, userId: string) {
  const { db } = await import('../db')
  console.log(`Starting sync for item ${itemId}`)

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  })

  let cursor = item?.cursor ?? undefined
  let hasMore = true
  let addedCount = 0

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  })
  const accountMap = new Map(dbAccounts.map(a => [a.plaidAccountId, a.id]))

  try {
    while (hasMore) {
      const page = await plaidPost('/transactions/sync', {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      })

      for (const tx of page.added) {
        const accountId = accountMap.get(tx.account_id)
        if (!accountId) continue

        await db
          .insert(transactions)
          .values({
            accountId,
            plaidTransactionId: tx.transaction_id,
            amount: tx.amount,
            date: new Date(tx.date),
            merchantName: tx.merchant_name ?? tx.name,
            isReviewed: false,
            isRecurring: tx.recurring_transaction_id != null,
          })
          .onConflictDoNothing()
        addedCount++
      }

      cursor = page.next_cursor
      hasMore = page.has_more

      await db
        .update(plaidItems)
        .set({ cursor })
        .where(eq(plaidItems.id, itemId))
    }
    console.log(`Sync completed for item ${itemId}. Total added: ${addedCount}`)
    await categorizeTransactions(userId, itemId)
  } catch (error) {
    console.error(`Sync failed for item ${itemId}:`, error)
    throw error
  }
}

export const manualSync = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  })

  for (const item of items) {
    await syncTransactions(item.accessToken, item.id, userId)
  }
})

export const removeItem = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number }

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, id),
  })

  if (!item || item.userId !== userId) throw new Error('Item not found')

  try {
    await plaidPost('/item/remove', { access_token: item.accessToken })
  } catch (e) {
    console.error('Failed to remove item from Plaid, proceeding with local deletion', e)
  }

  await db.delete(plaidItems).where(eq(plaidItems.id, id))
})

export const deleteAccount = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { plaidItem: true }
  })

  if (!account || account.plaidItem?.userId !== userId) throw new Error('Account not found')

  await db.delete(accounts).where(eq(accounts.id, id))
})

function mapAccountType(plaidType: string): string {
  const map: Record<string, string> = {
    depository: 'cash',
    credit: 'credit',
    investment: 'investment',
    loan: 'loan',
    other: 'cash',
  }
  return map[plaidType] ?? 'cash'
}
