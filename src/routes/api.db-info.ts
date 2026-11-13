import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

/**
 * TEMPORARY diagnostic: fingerprints the DB env the deployed function sees and
 * returns a few read-only facts. Remove after use.
 */
export const Route = createFileRoute("/api/db-info")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
        const token = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
        const hash = (value: string) =>
          value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;

        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");

        const one = async (query: ReturnType<typeof sql>) => {
          const rows = (await db.run(query)) as unknown as { rows?: unknown[] };
          return rows.rows?.[0] ?? null;
        };

        return Response.json({
          tursoUrlHash: hash(url),
          tursoTokenHash: hash(token),
          tursoUrlHost: url ? new URL(url.replace(/^["']|["']$/g, "")).host : null,
          account77: await one(
            sql`select id, name, type, plaid_account_id, current_balance from accounts where id = 77`,
          ),
          amazonTotal: await one(
            sql`select count(*) c from transactions where lower(merchant_name) like '%amazon%'`,
          ),
          amazonSinceOct23: await one(
            sql`select count(*) c from transactions where lower(merchant_name) like '%amazon%' and date > 1792627200`,
          ),
          amazonMissingNotes: await one(
            sql`select count(*) c from transactions where lower(merchant_name) like '%amazon%' and amount > 0 and (note is null or trim(note) = '')`,
          ),
          items: (await db.run(sql`select id, last_synced_at from plaid_items order by id`)) as never,
        });
      },
    },
  },
});
