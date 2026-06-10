import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type Args = {
  dryRun: boolean;
  headless: boolean;
  limit: number;
  overwrite: boolean;
  pages: number;
  production: boolean;
};

type PaymentRow = {
  amountCents: number;
  href: string;
  orderId: string;
};

type LocalTransaction = {
  id: number;
  amount: number;
  merchantName: string;
  note: string | null;
};

const TRANSACTIONS_URL = "https://www.amazon.com/cpe/yourpayments/transactions?ref_=ya_d_l_pmt_mpo";

const args = parseArgs(process.argv.slice(2));
const databasePath = resolveDatabasePath(args.production);
const profileDir = path.resolve(process.cwd(), "data/amazon-playwright-profile");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  console.log(
    [
      "[amazon-notes] starting",
      `mode=${args.production ? "production" : "sandbox"}`,
      `db=${databasePath.replace(process.cwd(), ".")}`,
      `pages=${args.pages}`,
      `limit=${args.limit}`,
      `dryRun=${args.dryRun}`,
      `overwrite=${args.overwrite}`,
    ].join(" | "),
  );

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: args.headless,
    viewport: { width: 1280, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());

  try {
    await page.goto(TRANSACTIONS_URL, { waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page);

    const payments = await scrapePayments(page, args.pages, args.limit);
    console.log(`[amazon-notes] scraped payment rows: ${payments.length}`);

    const notesByAmountCents = new Map<number, string>();
    for (const payment of payments) {
      if (notesByAmountCents.has(payment.amountCents)) continue;

      const note = await scrapeOrderNote(page, payment);
      if (note) {
        notesByAmountCents.set(payment.amountCents, note);
        console.log(
          `[amazon-notes] ${formatCents(payment.amountCents)} ${payment.orderId}: ${note}`,
        );
      }
    }

    const result = updateLocalNotes(notesByAmountCents);
    console.log(
      [
        "[amazon-notes] finished",
        `candidateNotes=${notesByAmountCents.size}`,
        `matchedTransactions=${result.matched}`,
        `updatedTransactions=${result.updated}`,
        `skippedExistingNotes=${result.skippedExisting}`,
      ].join(" | "),
    );
  } finally {
    await browser.close();
  }
}

function parseArgs(argv: string[]): Args {
  const getNumber = (name: string, fallback: number) => {
    const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
    const value = inline?.split("=")[1];
    const parsed = value ? Number(value) : fallback;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    dryRun: argv.includes("--dry-run"),
    headless: argv.includes("--headless"),
    limit: getNumber("limit", 100),
    overwrite: argv.includes("--overwrite"),
    pages: getNumber("pages", 10),
    production: argv.includes("--production") || argv.includes("--prod"),
  };
}

function resolveDatabasePath(production: boolean) {
  const dbPath = production
    ? process.env.PLAID_PRODUCTION_DATABASE_URL
    : process.env.PLAID_SANDBOX_DATABASE_URL;

  return path.resolve(
    process.cwd(),
    stripSqlitePrefix(dbPath ?? process.env.DATABASE_URL ?? "data/dev.db"),
  );
}

function stripSqlitePrefix(value: string) {
  return value.replace(/^file:/, "").replace(/^"|"$/g, "");
}

async function ensureLoggedIn(page: import("@playwright/test").Page) {
  const hasTransactionRows = await page
    .locator('a[href*="orderID="]')
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (hasTransactionRows) return;

  console.log("[amazon-notes] log in to Amazon in the opened browser, then press Enter here.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("");
  rl.close();

  await page.goto(TRANSACTIONS_URL, { waitUntil: "domcontentloaded" });
  await page.locator('a[href*="orderID="]').first().waitFor({ timeout: 30_000 });
}

async function scrapePayments(
  page: import("@playwright/test").Page,
  maxPages: number,
  limit: number,
) {
  const rows: PaymentRow[] = [];
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < maxPages && rows.length < limit; pageIndex += 1) {
    await page.locator('a[href*="orderID="]').first().waitFor({ timeout: 30_000 });
    const pageRows = await page.evaluate(() => {
      const parseAmountCents = (value: string) => {
        const sign = value.includes("-") ? -1 : 1;
        const numeric = value.replace(/[^0-9.]/g, "");
        return Math.abs(Math.round(Number(numeric) * 100 * sign));
      };

      return [...document.querySelectorAll<HTMLAnchorElement>('a[href*="orderID="]')]
        .map((link) => {
          let node: HTMLElement | null = link;
          let text = "";
          for (let depth = 0; depth < 8 && node; depth += 1) {
            text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
            if (/[-+]?\$[\d,]+\.\d{2}/.test(text) && /Order #/.test(text)) break;
            node = node.parentElement;
          }

          const amount = text.match(/[-+]?\$[\d,]+\.\d{2}/)?.[0];
          const orderId =
            new URL(link.href).searchParams.get("orderID") ??
            link.textContent?.match(/Order #([A-Z0-9-]+)/)?.[1] ??
            "";

          if (!amount || !orderId) return null;
          return {
            amountCents: parseAmountCents(amount),
            href: link.href,
            orderId,
          };
        })
        .filter(Boolean);
    });

    for (const row of pageRows) {
      const payment = row as PaymentRow;
      const key = `${payment.orderId}:${payment.amountCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(payment);
      if (rows.length >= limit) break;
    }

    if (rows.length >= limit) break;
    const clickedNext = await clickNextTransactionsPage(page);
    if (!clickedNext) break;
    await page.waitForTimeout(2_500);
  }

  return rows;
}

async function clickNextTransactionsPage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'input[type="submit"], button',
    )];
    const next =
      candidates.find((element) =>
        /next page/i.test(
          element.getAttribute("aria-label") ||
            element.textContent ||
            element.getAttribute("aria-labelledby") ||
            "",
        ),
      ) ??
      candidates.find((element) =>
        /DefaultNextPageNavigationEvent/.test(element.getAttribute("name") || ""),
      );

    if (!next || next.disabled) return false;
    next.click();
    return true;
  });
}

async function scrapeOrderNote(page: import("@playwright/test").Page, payment: PaymentRow) {
  await page.goto(payment.href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  const titles = await page.evaluate(() => {
    const selectors = [
      'a[href*="ppx_hzod_title_dt_b_fed_asin_title"]',
      'a[href*="ppx_hzod_image_dt_b_fed_asin_title"] img',
      'a[href*="ppx_yo_dt_b_asin_title"]',
    ];
    const values = selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map((element) =>
        (element.textContent || element.getAttribute("alt") || "").replace(/\s+/g, " ").trim(),
      ),
    );

    return [...new Set(values.filter(Boolean))];
  });

  if (titles.length === 0) return null;
  const visibleTitles = titles.slice(0, 3);
  const suffix =
    titles.length > visibleTitles.length ? ` +${titles.length - visibleTitles.length} more` : "";
  return `Amazon: ${visibleTitles.join("; ")}${suffix}`;
}

function updateLocalNotes(notesByAmountCents: Map<number, string>) {
  const db = new Database(databasePath);
  const transactions = db
    .prepare(
      `
        select
          id,
          amount,
          merchant_name as merchantName,
          note
        from transactions
        where lower(merchant_name) like '%amazon%'
          or lower(merchant_name) like '%amzn%'
      `,
    )
    .all() as LocalTransaction[];

  const update = db.prepare("update transactions set note = ? where id = ?");
  let matched = 0;
  let updated = 0;
  let skippedExisting = 0;

  const tx = db.transaction(() => {
    for (const transaction of transactions) {
      const amountCents = Math.abs(Math.round(transaction.amount * 100));
      const note = notesByAmountCents.get(amountCents);
      if (!note) continue;
      matched += 1;

      if (!args.overwrite && transaction.note?.trim()) {
        skippedExisting += 1;
        continue;
      }

      if (!args.dryRun) update.run(note, transaction.id);
      updated += 1;
    }
  });

  tx();
  db.close();

  return { matched, skippedExisting, updated };
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
