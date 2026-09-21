import { sqliteTable, integer, text, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";

export const plaidItems = sqliteTable("plaid_items", {
  id: integer().primaryKey({ autoIncrement: true }),
  itemId: text("item_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  userId: text("user_id").notNull(),
  institutionName: text("institution_name"),
  cursor: text(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const accounts = sqliteTable("accounts", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(), // cash, credit, investment, loan, real_estate
  currentBalance: real("current_balance").notNull().default(0),
  userId: text("user_id"), // set for manual (non-Plaid) accounts
  plaidItemId: integer("plaid_item_id").references(() => plaidItems.id),
  plaidAccountId: text("plaid_account_id").unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const categories = sqliteTable("categories", {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text().notNull(),
  icon: text(),
  budgetAmount: real("budget_amount").notNull().default(0),
  parentId: integer("parent_id"),
});

export const monthlyBudgets = sqliteTable(
  "monthly_budgets",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    month: text().notNull(),
    expectedIncomeCents: integer("expected_income_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("monthly_budgets_user_month_idx").on(t.userId, t.month)],
);

export const monthlyBudgetAllocations = sqliteTable(
  "monthly_budget_allocations",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    monthlyBudgetId: integer("monthly_budget_id")
      .notNull()
      .references(() => monthlyBudgets.id),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    amountCents: integer("amount_cents").notNull().default(0),
  },
  (t) => [
    uniqueIndex("monthly_budget_allocations_budget_category_idx").on(
      t.monthlyBudgetId,
      t.categoryId,
    ),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    categoryId: integer("category_id").references(() => categories.id),
    plaidTransactionId: text("plaid_transaction_id").unique(),
    amount: real().notNull(),
    date: integer({ mode: "timestamp" }).notNull(),
    datetime: integer({ mode: "timestamp" }),
    name: text(),
    merchantName: text("merchant_name").notNull(),
    location: text(),
    note: text(),
    isReviewed: integer("is_reviewed", { mode: "boolean" }).notNull().default(false),
    isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
    isPending: integer("is_pending", { mode: "boolean" }).notNull().default(false),
    splitParentId: integer("split_parent_id"),
    ruleId: integer("rule_id"),
    transactionType: text("transaction_type", { enum: ["regular", "income", "transfer"] })
      .notNull()
      .default("regular"),
  },
  (t) => [index("transactions_split_parent_idx").on(t.splitParentId)],
);

export const categorizationRules = sqliteTable(
  "categorization_rules",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    pattern: text().notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    transactionType: text("transaction_type", { enum: ["regular", "income", "transfer"] })
      .notNull()
      .default("regular"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [index("categorization_rules_user_idx").on(t.userId)],
);

export const historicalBalances = sqliteTable(
  "historical_balances",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    date: integer({ mode: "timestamp" }).notNull(),
    balance: real().notNull(),
    source: text().notNull().default("snapshot"), // 'snapshot' | 'plaid_assets'
  },
  (t) => [uniqueIndex("historical_balances_account_date_idx").on(t.accountId, t.date)],
);

export const securities = sqliteTable("securities", {
  id: integer().primaryKey({ autoIncrement: true }),
  plaidSecurityId: text("plaid_security_id").notNull().unique(),
  name: text().notNull(),
  tickerSymbol: text("ticker_symbol"),
  type: text(), // equity, etf, mutual fund, cash, cryptocurrency, etc.
  closePrice: real("close_price"),
  isoCurrencyCode: text("iso_currency_code"),
});

export const holdings = sqliteTable(
  "holdings",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id),
    quantity: real().notNull().default(0),
    institutionPrice: real("institution_price"),
    institutionValue: real("institution_value").notNull().default(0),
    costBasis: real("cost_basis"),
    isoCurrencyCode: text("iso_currency_code"),
    asOf: integer("as_of", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("holdings_account_security_idx").on(t.accountId, t.securityId)],
);

// Relations
export const plaidItemsRelations = relations(plaidItems, ({ many }) => ({
  accounts: many(accounts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  plaidItem: one(plaidItems, {
    fields: [accounts.plaidItemId],
    references: [plaidItems.id],
  }),
  transactions: many(transactions),
  historicalBalances: many(historicalBalances),
  holdings: many(holdings),
}));

export const securitiesRelations = relations(securities, ({ many }) => ({
  holdings: many(holdings),
}));

export const holdingsRelations = relations(holdings, ({ one }) => ({
  account: one(accounts, {
    fields: [holdings.accountId],
    references: [accounts.id],
  }),
  security: one(securities, {
    fields: [holdings.securityId],
    references: [securities.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, { relationName: "category_hierarchy" }),
  transactions: many(transactions),
  monthlyBudgetAllocations: many(monthlyBudgetAllocations),
}));

export const monthlyBudgetsRelations = relations(monthlyBudgets, ({ many }) => ({
  allocations: many(monthlyBudgetAllocations),
}));

export const monthlyBudgetAllocationsRelations = relations(monthlyBudgetAllocations, ({ one }) => ({
  monthlyBudget: one(monthlyBudgets, {
    fields: [monthlyBudgetAllocations.monthlyBudgetId],
    references: [monthlyBudgets.id],
  }),
  category: one(categories, {
    fields: [monthlyBudgetAllocations.categoryId],
    references: [categories.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  rule: one(categorizationRules, {
    fields: [transactions.ruleId],
    references: [categorizationRules.id],
  }),
  splitParent: one(transactions, {
    fields: [transactions.splitParentId],
    references: [transactions.id],
    relationName: "transaction_splits",
  }),
  splitChildren: many(transactions, { relationName: "transaction_splits" }),
}));

export const categorizationRulesRelations = relations(categorizationRules, ({ one, many }) => ({
  category: one(categories, {
    fields: [categorizationRules.categoryId],
    references: [categories.id],
  }),
  transactions: many(transactions),
}));

export const historicalBalancesRelations = relations(historicalBalances, ({ one }) => ({
  account: one(accounts, {
    fields: [historicalBalances.accountId],
    references: [accounts.id],
  }),
}));
