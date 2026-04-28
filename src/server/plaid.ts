import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { plaidItems, accounts, transactions, historicalBalances } from '../db/schema'
import { eq } from 'drizzle-orm'
import { seedDefaultCategories } from './categories'
import { categorizeTransactions } from './categorize'

class PlaidApiError extends Error {
  constructor(
    message: string,
    public errorCode?: string,
    public errorType?: string,
  ) {
    super(message)
    this.name = 'PlaidApiError'
  }
}

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
  if (!res.ok) {
    throw new PlaidApiError(
      data.error_message ?? `Plaid error on ${path}`,
      data.error_code,
      data.error_type,
    )
  }
  return data
}

const isMissingPlaidItemError = (error: unknown) => {
  if (error instanceof PlaidApiError && error.errorCode === 'ITEM_NOT_FOUND') return true
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  return msg.includes('item you requested cannot be found') || msg.includes('item does not exist')
}

async function deleteLocalItemData(itemId: number) {
  const { db } = await import('../db')

  const itemAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  })

  await Promise.all(
    itemAccounts.flatMap(account => [
      db.delete(historicalBalances).where(eq(historicalBalances.accountId, account.id)),
      db.delete(transactions).where(eq(transactions.accountId, account.id)),
    ])
  )

  await db.delete(accounts).where(eq(accounts.plaidItemId, itemId))
  await db.delete(plaidItems).where(eq(plaidItems.id, itemId))
}

export const createLinkToken = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const data = await plaidPost('/link/token/create', {
    client_name: 'Monai',
    user: { client_user_id: userId },
    products: ['transactions', 'assets'],
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
    const { publicToken, institutionName } = (ctx as any).data as { publicToken: string; institutionName?: string }

    const { access_token, item_id } = await plaidPost('/item/public_token/exchange', {
      public_token: publicToken,
    })
    console.log(`[connect] token exchanged, item_id=${item_id}, institution=${institutionName ?? 'unknown'}`)

    const [item] = await db
      .insert(plaidItems)
      .values({ itemId: item_id, accessToken: access_token, userId, institutionName: institutionName ?? null })
      .returning()

    await seedAccounts(access_token, item.id)
    console.log(`[connect] accounts seeded`)
    await seedDefaultCategories(userId)
    // Clear cursor so Plaid returns full history (up to ~2 years) on first sync
    await syncTransactions(access_token, item.id, userId, true)
    console.log(`[connect] transactions synced`)
    // Backfill historical balances from Plaid Assets (up to 10 years, stops at null)
    await backfillHistoricalBalances(access_token, item.id).catch(err =>
      console.warn('[connect] Assets backfill failed (product may not be enabled):', err?.message),
    )
    console.log(`[connect] done`)
  })

// Backfill using Plaid Assets: one data point per month for the last 24 months.
// Makes a single report request for the max available history (730 days ~= 24 months),
// then stores one monthly balance point per account.
async function backfillHistoricalBalances(accessToken: string, itemId: number) {
  const { db } = await import('../db')

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  })
  if (dbAccounts.length === 0) {
    console.log('[backfill] no accounts found, skipping')
    return
  }

  const accountMap = new Map(dbAccounts.map(a => [a.plaidAccountId, a.id]))
  console.log(`[backfill] requesting asset report for ${dbAccounts.length} accounts (730 days)`)

  // One report for max history Plaid Assets supports (730 days)
  const { asset_report_token } = await plaidPost('/asset_report/create', {
    access_tokens: [accessToken],
    days_requested: 730,
  })
  console.log('[backfill] report created, polling...')

  // Poll until ready (max ~30s)
  let report: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      report = await plaidPost('/asset_report/get', {
        asset_report_token,
      })
      console.log(`[backfill] report ready (attempt ${attempt + 1})`)
      break
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? ''
      console.log(`[backfill] attempt ${attempt + 1}: not ready (${msg})`)
    }
  }
  if (!report) {
    console.warn('[backfill] report never became ready, giving up')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportItems: any[] = (report as any).report?.items ?? []
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)

  const monthTargets = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    return {
      monthStart: d,
      monthEnd: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    }
  })

  const insertOps = reportItems.flatMap((reportItem: any) =>
    (reportItem.accounts ?? []).flatMap((acct: any) => {
      const dbAccountId = accountMap.get(acct.account_id)
      if (!dbAccountId) return []

      const hbList: any[] = acct.historical_balances ?? []
      if (hbList.length === 0) return []

      return monthTargets.flatMap(target => {
        const monthly = hbList.filter((hb: any) => {
          const t = new Date(hb.date).getTime()
          return t >= target.monthStart.getTime() && t < target.monthEnd.getTime()
        })
        if (monthly.length === 0) return []

        const selected = monthly.reduce((latest: any, hb: any) =>
          new Date(hb.date).getTime() > new Date(latest.date).getTime() ? hb : latest
        )

        return [
          db
            .insert(historicalBalances)
            .values({ accountId: dbAccountId, date: target.monthStart, balance: selected.current ?? 0, source: 'plaid_assets' })
            .onConflictDoNothing(),
        ]
      })
    })
  )

  const results = await Promise.all(insertOps)
  const inserted = results.length

  console.log(`[backfill] stored up to monthly points for last 24 months (${inserted} inserts attempted)`)
}

async function seedAccounts(accessToken: string, itemId: number) {
  const { db } = await import('../db')

  const { accounts: plaidAccounts } = await plaidPost('/accounts/get', {
    access_token: accessToken,
  })

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plaidAccounts as any[]).map((acc: any) =>
      db
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
    )
  )
}

async function syncTransactions(accessToken: string, itemId: number, userId: string, fullHistory = false) {
  const { db } = await import('../db')
  console.log(`Starting sync for item ${itemId}${fullHistory ? ' (full history)' : ''}`)

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  })

  // fullHistory = true clears cursor so Plaid returns everything (new account link)
  let cursor = fullHistory ? undefined : (item?.cursor ?? undefined)
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

      // Batch-insert all added transactions in parallel
      const inserted = await Promise.all(
        page.added
          .filter((tx: any) => accountMap.has(tx.account_id))
          .map((tx: any) =>
            db
              .insert(transactions)
              .values({
                accountId: accountMap.get(tx.account_id)!,
                plaidTransactionId: tx.transaction_id,
                amount: tx.amount,
                date: new Date(tx.date),
                merchantName: tx.merchant_name ?? tx.name,
                isReviewed: false,
                isRecurring: tx.recurring_transaction_id != null,
              })
              .onConflictDoNothing()
          )
      )
      addedCount += inserted.length

      cursor = page.next_cursor
      hasMore = page.has_more

      await db
        .update(plaidItems)
        .set({ cursor })
        .where(eq(plaidItems.id, itemId))
    }
    console.log(`Sync completed for item ${itemId}. Total added: ${addedCount}`)
    await db.update(plaidItems).set({ lastSyncedAt: new Date() }).where(eq(plaidItems.id, itemId))
    await categorizeTransactions(userId, itemId)

    // Snapshot current balances — normalize to today UTC midnight so unique index dedupes same-day syncs
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const freshAccounts = await db.query.accounts.findMany({
      where: eq(accounts.plaidItemId, itemId),
    })
    await Promise.all(
      freshAccounts.map(acct =>
        db
          .insert(historicalBalances)
          .values({ accountId: acct.id, date: today, balance: acct.currentBalance, source: 'snapshot' })
          .onConflictDoNothing()
      )
    )
  } catch (error) {
    if (isMissingPlaidItemError(error)) {
      console.warn(`Sync skipped for stale item ${itemId}; removing local records`)
      await deleteLocalItemData(itemId)
      return
    }
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

  await Promise.all(items.map(item => syncTransactions(item.accessToken, item.id, userId)))
})

export const runAICategorization = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ids } = ((ctx as any)?.data ?? {}) as { ids?: number[] }
  const selectedIds = Array.isArray(ids)
    ? ids.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : undefined

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  })

  await Promise.all(
    items.map(item => categorizeTransactions(userId, item.id, { recategorizeAll: true, transactionIds: selectedIds }))
  )
})

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

export const autoSync = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth()
  if (!userId) return

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
  })

  const now = Date.now()
  const stale = items.filter(item => now - (item.lastSyncedAt?.getTime() ?? 0) >= SYNC_INTERVAL_MS)

  await Promise.all(
    stale.map(item => {
      console.log(`Auto-sync: item ${item.id} last synced ${Math.round((now - (item.lastSyncedAt?.getTime() ?? 0)) / 3_600_000)}h ago`)
      return syncTransactions(item.accessToken, item.id, userId).catch(error =>
        console.error(`Auto-sync failed for item ${item.id}:`, error)
      )
    })
  )
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

  await deleteLocalItemData(id)
  console.log(`Disconnected item ${id} and removed local data`)
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
