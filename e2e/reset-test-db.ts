import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export const TEST_DB_PATH = "./data/test-e2e.db";

/**
 * Rebuild the e2e database from scratch: wipe the file, push the schema, seed.
 *
 * This must run *before* the dev server starts. Playwright launches its
 * `webServer` before `globalSetup`, so seeding from `globalSetup` deadlocks on a
 * clean checkout: the server 500s on a missing table, Playwright waits for a 2xx,
 * and the seed that would fix it never runs. A stale database on disk hid this.
 *
 * Deleting the file first also clears schema leftovers (e.g. a half-finished
 * `__new_transactions` migration) that would otherwise fail every query.
 */
export function resetTestDatabase() {
  const resolvedDbPath = path.resolve(process.cwd(), TEST_DB_PATH);
  const expectedTestDbPath = path.resolve(process.cwd(), "./data/test-e2e.db");
  if (resolvedDbPath !== expectedTestDbPath) {
    throw new Error(`Refusing to reset non-test database: ${resolvedDbPath}`);
  }

  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(resolvedDbPath + suffix, { force: true });
  }

  const env = {
    ...process.env,
    DATABASE_URL: TEST_DB_PATH,
    // Outranks TURSO_DATABASE_URL, which .env.local injects into drizzle.config.
    // Without this the e2e schema push silently targets production.
    MONAI_DATABASE_URL: TEST_DB_PATH,
    PLAID_ENV: "sandbox",
  };

  execSync("bunx drizzle-kit push --force", { stdio: "inherit", cwd: process.cwd(), env });
  execSync("bun e2e/seed-test-db.ts", { stdio: "inherit", cwd: process.cwd(), env });
}
