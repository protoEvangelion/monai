import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

const url = (
  process.env.TURSO_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  ""
).replace(/^["']|["']$/g, "");

const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
const isTurso = url.startsWith("libsql://") || url.startsWith("https://");

const fileUrl =
  !url
    ? "file:./data/dev.db"
    : url.startsWith("file:") || url.startsWith("libsql://") || url.startsWith("http")
      ? url
      : url.startsWith("/") || url.startsWith(".")
        ? `file:${url}`
        : `file:./${url}`;

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: isTurso ? "turso" : "sqlite",
  dbCredentials: isTurso
    ? {
        url: fileUrl,
        authToken: authToken ?? "",
      }
    : {
        url: fileUrl,
      },
});
