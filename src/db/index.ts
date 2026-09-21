import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

/**
 * Supports:
 * - Local file SQLite: `file:./data/dev.db` or `./data/dev.db` or absolute path
 * - Turso / LibSQL remote: `libsql://...` or `https://...` (+ TURSO_AUTH_TOKEN)
 *
 * Prefer TURSO_DATABASE_URL when set (Vercel demo); otherwise DATABASE_URL.
 */
function resolveDatabaseUrl() {
  const raw =
    process.env.TURSO_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!raw) {
    throw new Error(
      "Missing DATABASE_URL (or TURSO_DATABASE_URL). Example: file:./data/dev.db or libsql://<db>.turso.io",
    );
  }

  const unquoted = raw.replace(/^["']|["']$/g, "");

  if (
    unquoted.startsWith("libsql://") ||
    unquoted.startsWith("https://") ||
    unquoted.startsWith("http://") ||
    unquoted.startsWith("file:")
  ) {
    return unquoted;
  }

  // Absolute or relative filesystem path → LibSQL file URL
  return unquoted.startsWith("/") || unquoted.startsWith(".")
    ? `file:${unquoted}`
    : `file:./${unquoted}`;
}

const url = resolveDatabaseUrl();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
