import { sqliteTable, integer, text, real, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'

export const plaidItems = sqliteTable('plaid_items', {
  id: integer().primaryKey({ autoIncrement: true }),
  itemId: text('item_id').notNull().unique(),
  accessToken: text('access_token').notNull(),
  userId: text('user_id').notNull(),
  institutionName: text('institution_name'),
  cursor: text(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const accounts = sqliteTable('accounts', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(), // cash, credit, investment, loan, real_estate
  currentBalance: real('current_balance').notNull().default(0),
  plaidItemId: integer('plaid_item_id').references(() => plaidItems.id),
  plaidAccountId: text('plaid_account_id').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const categories = sqliteTable('categories', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  name: text().notNull(),
  icon: text(),
  budgetAmount: real('budget_amount').notNull().default(0),
  parentId: integer('parent_id'),
})

export const transactions = sqliteTable('transactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  plaidTransactionId: text('plaid_transaction_id').unique(),
  amount: real().notNull(),
  date: integer({ mode: 'timestamp' }).notNull(),
  merchantName: text('merchant_name').notNull(),
  note: text(),
  isReviewed: integer('is_reviewed', { mode: 'boolean' }).notNull().default(false),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
})

export const historicalBalances = sqliteTable(
  'historical_balances',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    date: integer({ mode: 'timestamp' }).notNull(),
    balance: real().notNull(),
    source: text().notNull().default('snapshot'), // 'snapshot' | 'plaid_assets'
  },
  (t) => [uniqueIndex('historical_balances_account_date_idx').on(t.accountId, t.date)],
)

// Relations
export const plaidItemsRelations = relations(plaidItems, ({ many }) => ({
  accounts: many(accounts),
}))

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  plaidItem: one(plaidItems, {
    fields: [accounts.plaidItemId],
    references: [plaidItems.id],
  }),
  transactions: many(transactions),
  historicalBalances: many(historicalBalances),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_hierarchy',
  }),
  children: many(categories, { relationName: 'category_hierarchy' }),
  transactions: many(transactions),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}))

export const historicalBalancesRelations = relations(historicalBalances, ({ one }) => ({
  account: one(accounts, {
    fields: [historicalBalances.accountId],
    references: [accounts.id],
  }),
}))
