import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'

export const accounts = sqliteTable('accounts', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(), // cash, credit, investment, loan, real_estate
  currentBalance: real('current_balance').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const categories = sqliteTable('categories', {
  id: integer().primaryKey({ autoIncrement: true }),
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
  amount: real().notNull(),
  date: integer({ mode: 'timestamp' }).notNull(),
  merchantName: text('merchant_name').notNull(),
  note: text(),
  isReviewed: integer('is_reviewed', { mode: 'boolean' }).notNull().default(false),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
})

export const historicalBalances = sqliteTable('historical_balances', {
  id: integer().primaryKey({ autoIncrement: true }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  date: integer({ mode: 'timestamp' }).notNull(),
  balance: real().notNull(),
})

// Relations
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  historicalBalances: many(historicalBalances),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_hierarchy',
  }),
  children: many(categories, {
    relationName: 'category_hierarchy',
  }),
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
