/**
 * Create a Clerk demo login and attach local sandbox demo data to it.
 *
 * Usage: bun scripts/setup-demo-user.ts
 *
 * Env (from .env.local):
 *   CLERK_SECRET_KEY
 *   DATABASE_URL (defaults to ./data/dev.db)
 * Optional overrides:
 *   DEMO_EMAIL / DEMO_PASSWORD / DEMO_SOURCE_USER_ID
 */
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { DEV_USER_ID } from "../src/lib/devAuth";

async function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const file = Bun.file(path);
  if (!(await file.exists())) return;
  const text = await file.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function resolveDbPath(raw: string | undefined) {
  const value = (raw ?? "./data/dev.db").replace(/^file:/, "");
  return resolve(process.cwd(), value);
}

async function clerkFetch(path: string, init?: RequestInit) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is required");

  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Clerk ${init?.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return json as Record<string, unknown>;
}

async function findUserByEmail(email: string) {
  const q = encodeURIComponent(email);
  const result = await clerkFetch(`/users?email_address=${q}&limit=1`);
  const data = Array.isArray(result)
    ? result
    : Array.isArray((result as { data?: unknown[] }).data)
      ? ((result as { data: unknown[] }).data as Record<string, unknown>[])
      : [];
  return (data[0] as { id?: string } | undefined) ?? null;
}

async function createDemoUser(email: string, password: string) {
  const existing = await findUserByEmail(email);
  if (existing?.id) {
    // Ensure password matches what we print (demo convenience).
    await clerkFetch(`/users/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        password,
        skip_password_checks: true,
        first_name: "Demo",
        last_name: "User",
      }),
    });
    return { id: existing.id, created: false };
  }

  const created = await clerkFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
      first_name: "Demo",
      last_name: "User",
    }),
  });

  const id = created.id as string | undefined;
  if (!id) throw new Error("Clerk create user returned no id");
  return { id, created: true };
}

function reassignDemoData(dbPath: string, fromUserId: string, toUserId: string) {
  const db = new Database(dbPath);
  try {
    db.exec("BEGIN");
    const run = (sql: string) =>
      db.prepare(sql).run({ $from: fromUserId, $to: toUserId });

    const items = run(
      "UPDATE plaid_items SET user_id = $to WHERE user_id = $from",
    ).changes;
    const cats = run(
      "UPDATE categories SET user_id = $to WHERE user_id = $from",
    ).changes;
    const rules = run(
      "UPDATE categorization_rules SET user_id = $to WHERE user_id = $from",
    ).changes;
    const budgets = run(
      "UPDATE monthly_budgets SET user_id = $to WHERE user_id = $from",
    ).changes;
    const accounts = run(
      "UPDATE accounts SET user_id = $to WHERE user_id = $from",
    ).changes;

    // Ensure at least one useful rule for demos.
    const uber = db
      .prepare(
        "SELECT id FROM categorization_rules WHERE user_id = $to AND lower(pattern) = 'uber' LIMIT 1",
      )
      .get({ $to: toUserId }) as { id: number } | null;

    if (!uber) {
      const rideshare = db
        .prepare(
          `SELECT id FROM categories
           WHERE user_id = $to AND lower(name) = 'rideshare' LIMIT 1`,
        )
        .get({ $to: toUserId }) as { id: number } | null;
      if (rideshare) {
        db.prepare(
          `INSERT INTO categorization_rules (user_id, pattern, category_id, transaction_type)
           VALUES ($to, 'Uber', $cat, 'regular')`,
        ).run({ $to: toUserId, $cat: rideshare.id });
      }
    }

    db.exec("COMMIT");
    return { items, cats, rules, budgets, accounts };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

await loadEnvLocal();

const email = process.env.DEMO_EMAIL ?? "demo@monai.app";
const password = process.env.DEMO_PASSWORD ?? "MonaiDemo2026!";
const sourceUserId = process.env.DEMO_SOURCE_USER_ID ?? DEV_USER_ID;
const dbPath = resolveDbPath(process.env.DATABASE_URL);

console.log(`[demo] database: ${dbPath}`);
console.log(`[demo] creating/updating Clerk user ${email}…`);

const user = await createDemoUser(email, password);
console.log(
  `[demo] Clerk user ${user.created ? "created" : "updated"}: ${user.id}`,
);

const moved = reassignDemoData(dbPath, sourceUserId, user.id);
console.log("[demo] reassigned sandbox data:", moved);

console.log("");
console.log("────────────────────────────────────");
console.log(" Demo login");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  User ID:  ${user.id}`);
console.log("────────────────────────────────────");
console.log("Sign in at http://localhost:3000/sign-in");
