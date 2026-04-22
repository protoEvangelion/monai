import OpenAI from 'openai'
import { categories, transactions, accounts } from '../db/schema'
import { eq, isNull, inArray, and } from 'drizzle-orm'

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://monai.app',
    'X-Title': 'Monai',
  },
})

type Category = { id: number; name: string; parentId: number | null }
type Transaction = { id: number; merchantName: string; amount: number }
type Assignment = { id: number; categoryId: number | null }

async function categorizeBatch(batch: Transaction[], cats: Category[], parentNames: Map<number, string>) {
  const categoryList = cats
    .map(c => `${c.id}: ${c.name}${c.parentId ? ` (${parentNames.get(c.parentId) ?? ''})` : ''}`)
    .join('\n')

  const txList = JSON.stringify(
    batch.map(t => ({ id: t.id, merchant: t.merchantName, amount: t.amount }))
  )

  const completion = await openrouter.chat.completions.create({
    model: 'google/gemini-2.0-flash-exp:free',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You are a financial transaction categorizer.',
          'Assign each transaction to exactly one category from the provided list.',
          'Rules:',
          '- ONLY use category IDs from the list. Never invent IDs.',
          '- Negative amounts are typically income or refunds.',
          '- If nothing fits, use null.',
          'Return ONLY valid JSON: {"results": [{"id": <transactionId>, "categoryId": <number or null>}]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Categories:\n${categoryList}\n\nTransactions:\n${txList}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { results?: Assignment[] }
  return parsed.results ?? []
}

export async function categorizeTransactions(userId: string, itemId: number) {
  const { db } = await import('../db')

  const allCats = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
  })

  const leafCats = allCats.filter(c => c.parentId !== null)
  if (leafCats.length === 0) return

  const parentNames = new Map(
    allCats.filter(c => c.parentId === null).map(c => [c.id, c.name])
  )

  const accs = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  })
  const accountIds = accs.map(a => a.id)
  if (accountIds.length === 0) return

  const uncategorized = await db.query.transactions.findMany({
    where: and(
      inArray(transactions.accountId, accountIds),
      isNull(transactions.categoryId)
    ),
  })
  if (uncategorized.length === 0) return

  const validIds = new Set(leafCats.map(c => c.id))
  const CHUNK = 100

  for (let i = 0; i < uncategorized.length; i += CHUNK) {
    const batch = uncategorized.slice(i, i + CHUNK)
    try {
      const assignments = await categorizeBatch(batch, leafCats, parentNames)
      for (const { id, categoryId } of assignments) {
        if (categoryId !== null && !validIds.has(categoryId)) continue
        await db
          .update(transactions)
          .set({ categoryId })
          .where(eq(transactions.id, id))
      }
    } catch (err) {
      console.error('Categorization batch failed, skipping:', err)
    }
  }
}
