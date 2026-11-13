import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

/**
 * Supports:
 * - Local file SQLite: `file:./data/dev.db` or `./data/dev.db` or absolute path
 * - Turso / LibSQL remote: `libsql://...` or `https://...` (+ auth token)
 *
 * Precedence: MONAI_DATABASE_URL → TURSO_DATABASE_URL → DATABASE_URL.
 *
 * `MONAI_DATABASE_URL` exists because the Vercel–Turso integration injects
 * `TURSO_DATABASE_URL` per deployment (a `dpl-<id>-…` host), so every deploy
 * forked a fresh database and anything written in the app was discarded on the
 * next deploy. A differently-named variable cannot be overwritten by the
 * integration, so setting it pins production to one stable database.
 */
function resolveDatabaseUrl() {
  const raw =
    process.env.MONAI_DATABASE_URL?.trim() ||
    process.env.TURSO_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!raw) {
    throw new Error(
      "Missing MONAI_DATABASE_URL, TURSO_DATABASE_URL or DATABASE_URL. " +
        "Example: file:./data/dev.db or libsql://<db>.turso.io",
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
const authToken =
  process.env.MONAI_DATABASE_AUTH_TOKEN?.trim() ||
  process.env.TURSO_AUTH_TOKEN?.trim() ||
  undefined;

// Host only, never the token. Makes "which database is this deployment on?"
// answerable from the logs instead of a guessing game.
if (url.startsWith("libsql://") || url.startsWith("https://")) {
  try {
    console.log(`[db] ${new URL(url).host}`);
  } catch {
    // Malformed URL: createClient will surface the real error.
  }
}

const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
