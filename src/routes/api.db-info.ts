import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

/**
 * TEMPORARY diagnostic: fingerprints the DB env the deployed function sees.
 * Returns hashes only, never the values. Remove after use.
 */
export const Route = createFileRoute("/api/db-info")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
        const token = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
        const fallback = process.env.DATABASE_URL?.trim() ?? "";
        const hash = (value: string) =>
          value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;
        return Response.json({
          tursoUrlHash: hash(url),
          tursoTokenHash: hash(token),
          databaseUrlHash: hash(fallback),
          tursoUrlHost: url ? new URL(url.replace(/^["']|["']$/g, "")).host : null,
          hasTursoUrl: Boolean(url),
          hasTursoToken: Boolean(token),
        });
      },
    },
  },
});
