import { resolve } from "node:path";

const args = Bun.argv.slice(2);
const modeArg = args.find(
  (arg) => arg === "--production" || arg === "--prod" || arg === "--sandbox",
);
const forwardedArgs = args.filter(
  (arg) => arg !== "--production" && arg !== "--prod" && arg !== "--sandbox",
);
const mode = modeArg === "--production" || modeArg === "--prod" ? "production" : "sandbox";

const env = { ...process.env };

/**
 * Credential modes (local):
 * - default / --sandbox → Plaid sandbox + sandbox/local DB (safe for demos)
 * - --production / --prod → Plaid production + real data DB
 *
 * Real bank data (and its Plaid access tokens) live in Turso. Plaid tokens are
 * environment-specific, so that DB can only be synced with production keys —
 * sandbox keys make Plaid reject every stored item.
 *
 * On Vercel, set PLAID_ENV + PLAID_SECRET (+ TURSO_*) explicitly.
 * Never put PLAID_PRODUCTION_* on a public demo deployment.
 */
if (mode === "production") {
  // Real bank data lives in Turso. Keep TURSO_* when configured so local and
  // Vercel share one DB; only fall back to the local SQLite production file.
  if (env.TURSO_DATABASE_URL) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = env.PLAID_PRODUCTION_DATABASE_URL ?? env.DATABASE_URL;
  }
  env.PLAID_ENV = env.PLAID_PRODUCTION_ENV ?? "production";
  env.PLAID_SECRET = env.PLAID_PRODUCTION_SECRET ?? env.PLAID_SECRET;
} else {
  // Sandbox mode stays local-only so sandbox keys never touch real bank rows.
  delete env.TURSO_DATABASE_URL;
  env.DATABASE_URL = env.PLAID_SANDBOX_DATABASE_URL ?? env.DATABASE_URL;
  env.PLAID_ENV = env.PLAID_SANDBOX_ENV ?? env.PLAID_ENV ?? "sandbox";
  env.PLAID_SECRET = env.PLAID_SANDBOX_SECRET ?? env.PLAID_SECRET;
}

env.MONAI_CREDENTIAL_MODE = mode;

const databaseLabel = env.TURSO_DATABASE_URL
  ? `turso:${String(env.TURSO_DATABASE_URL).replace(/^https?:\/\//, "").replace(/^libsql:\/\//, "").split("/")[0]}`
  : env.DATABASE_URL
    ? env.DATABASE_URL.replace(process.cwd(), ".")
    : "<unset>";

console.log(
  [
    `[monai] starting dev server`,
    `mode=${mode}`,
    `plaid=${env.PLAID_ENV ?? "<unset>"}`,
    `db=${databaseLabel}`,
  ].join(" | "),
);

if (mode === "production" && env.PLAID_ENV === "production") {
  console.log(
    "[monai] WARNING: production Plaid + real DB — do not deploy these credentials to a public Vercel demo.",
  );
}

if (mode === "sandbox" && process.env.TURSO_DATABASE_URL) {
  console.log(
    "[monai] TURSO_DATABASE_URL is set but ignored in sandbox mode. " +
      "Run `bun run dev --production` to use the shared Turso bank data.",
  );
}

const viteBin = resolve(process.cwd(), "node_modules/vite/bin/vite.js");

const child = Bun.spawn(["bun", viteBin, "dev", "--port", "3000", ...forwardedArgs], {
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await child.exited;
process.exit(exitCode);
