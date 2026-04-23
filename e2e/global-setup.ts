import { execSync } from 'child_process'
import path from 'path'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DB_PATH = process.env.DATABASE_URL!

export default async function globalSetup() {
  // Apply schema directly (no migration files needed)
  execSync('bunx drizzle-kit push --force', { stdio: 'inherit', cwd: process.cwd() })

  const db = new Database(DB_PATH)

  // Seed an account the transactions can reference
  db.exec(`
    INSERT OR IGNORE INTO accounts (id, name, type, current_balance)
    VALUES (1, 'Test Checking', 'cash', 1000);
  `)

  // Seed a parent category + child
  db.exec(`
    INSERT OR IGNORE INTO categories (id, user_id, name, icon, budget_amount, parent_id)
    VALUES (1, 'dev_user_123', 'Food', '🍔', 500, NULL);

    INSERT OR IGNORE INTO categories (id, user_id, name, icon, budget_amount, parent_id)
    VALUES (2, 'dev_user_123', 'Groceries', '🛒', 300, 1);
  `)

  // Seed a few unreviewed transactions so the review table is non-empty
  db.exec(`
    INSERT OR IGNORE INTO transactions (id, account_id, merchant_name, amount, date, is_reviewed)
    VALUES
      (1, 1, 'Whole Foods',  42.50, unixepoch('now', '-1 day'), 0),
      (2, 1, 'Uber Eats',    18.75, unixepoch('now', '-2 days'), 0),
      (3, 1, 'Netflix',      15.99, unixepoch('now', '-3 days'), 0);
  `)

  db.close()
}
