import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
process.env.DATABASE_URL = "./data/test-e2e.db";
process.env.PLAID_ENV = "sandbox";

const DB_PATH = process.env.DATABASE_URL!;

export default async function globalSetup() {
  const resolvedDbPath = path.resolve(process.cwd(), DB_PATH);
  const expectedTestDbPath = path.resolve(process.cwd(), "./data/test-e2e.db");
  if (resolvedDbPath !== expectedTestDbPath) {
    throw new Error(`Refusing to reset non-test database: ${resolvedDbPath}`);
  }

  // Ensure data directory exists (e.g. on Vercel CI)
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // Apply schema directly (no migration files needed)
  execSync("bunx drizzle-kit push --force", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: DB_PATH,
      PLAID_ENV: "sandbox",
    },
  });

  const db = new Database(DB_PATH);

  // Seed a Plaid item and account the transactions can reference
  db.exec(`
    INSERT OR IGNORE INTO plaid_items (id, item_id, access_token, user_id, institution_name, last_synced_at)
    VALUES (1, 'test_item', 'test_access_token', 'dev_user_123', 'Test Bank', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

    UPDATE plaid_items SET last_synced_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;

    INSERT OR IGNORE INTO accounts (id, name, type, current_balance, plaid_item_id)
    VALUES (1, 'Test Checking', 'cash', 1000, 1);

    UPDATE accounts SET plaid_item_id = 1 WHERE id = 1;
  `);

  // Seed a parent category + child
  db.exec(`
    INSERT OR IGNORE INTO categories (id, user_id, name, icon, budget_amount, parent_id)
    VALUES (1, 'dev_user_123', 'Food', '🍔', 500, NULL);

    INSERT OR IGNORE INTO categories (id, user_id, name, icon, budget_amount, parent_id)
    VALUES (2, 'dev_user_123', 'Groceries', '🛒', 300, 1);
  `);

  // Seed a few unreviewed transactions so the review table is non-empty
  db.exec(`
    DELETE FROM transactions;

    INSERT INTO transactions (id, account_id, merchant_name, amount, date, note, is_reviewed, transaction_type, category_id)
    VALUES
      (1, 1, 'Whole Foods',  42.50, unixepoch('now', '-1 day'), 'Weekly groceries', 0, 'regular', 2),
      (2, 1, 'Uber Eats',    18.75, unixepoch('now', '-2 days'), NULL, 0, 'regular', 2),
      (3, 1, 'Netflix',      15.99, unixepoch('now', '-3 days'), 'Family plan', 0, 'regular', 2),
      (4, 1, 'Online Transfer to Savings', 100.00, unixepoch('now', '-4 days'), 'Move to savings', 0, 'transfer', NULL),
      (5, 1, 'Payroll Deposit', -500.00, unixepoch('now', '-5 days'), 'May payroll', 0, 'income', NULL),
      (6, 1, 'Reviewed Coffee', 4.75, unixepoch('now', '-6 days'), 'Already handled', 1, 'regular', 2);
  `);

  db.close();
}
