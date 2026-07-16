import { execSync } from "child_process";
import path from "path";
import fs from "fs";
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

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  execSync("bunx drizzle-kit push --force", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: DB_PATH,
      PLAID_ENV: "sandbox",
    },
  });

  execSync("bun e2e/seed-test-db.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: DB_PATH,
      PLAID_ENV: "sandbox",
    },
  });
}
