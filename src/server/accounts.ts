import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { plaidItems } from '../db/schema'
import { eq } from 'drizzle-orm'

export const getAccounts = createServerFn().handler(async () => {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const { db } = await import('../db')

  const items = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  return items.flatMap(item => item.accounts)
})
