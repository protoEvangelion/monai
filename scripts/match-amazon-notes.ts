import { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  filterWorklistByTargets,
  parseAmazonTargets,
  type AmazonWorklistTx,
} from "./amazon-target-utils";

type Payment = {
  order_id: string;
  amount_cents: number;
  payment_date: string | null;
  snippet: string;
};

type Order = {
  order_id: string;
  order_date: string | null;
  suggestedNote: string | null;
  error?: string;
};

type Scrape = {
  payments: Payment[];
  orders: Order[];
};

type Match = {
  transactionId: number;
  note: string;
  categoryId?: number;
};

function parseArgv(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const listTargetsOnly = argv.includes("--list-targets");
  const targetsIdx = argv.indexOf("--targets");
  const targets = parseAmazonTargets(targetsIdx >= 0 ? argv[targetsIdx + 1] : "all");
  const reserved = new Set<string>(["--dry-run", "--list-targets", "--targets"]);
  if (targetsIdx >= 0) reserved.add(argv[targetsIdx + 1] ?? "");
  const positional = argv.filter((arg) => !reserved.has(arg));
  const scrapePath =
    positional[0] ?? path.resolve(process.cwd(), "data/amazon-payments-scraped.json");

  return { dryRun, listTargetsOnly, scrapePath, targets };
}

const { dryRun, listTargetsOnly, scrapePath, targets } = parseArgv(process.argv.slice(2));

const databasePath = path.resolve(
  process.cwd(),
  process.env.PLAID_PRODUCTION_DATABASE_URL?.replace(/^file:/, "").replace(/^"|"$/g, "") ??
    "data/production.db",
);

const db = new Database(databasePath);
const worklist = db
  .prepare(
    `
    select
      t.id,
      t.date,
      t.amount,
      t.merchant_name,
      t.name,
      t.category_id
    from transactions t
    where (
        lower(t.merchant_name) like '%amazon%'
        or lower(t.merchant_name) like '%amzn%'
        or lower(coalesce(t.name, '')) like '%amazon%'
      )
      and (t.note is null or trim(t.note) = '')
      and t.amount > 0
    order by t.date desc
  `,
  )
  .all() as AmazonWorklistTx[];

const targetedWorklist = filterWorklistByTargets(worklist, targets);

if (listTargetsOnly) {
  console.log(
    JSON.stringify(
      {
        targets,
        worklist: worklist.length,
        matchedTargets: targetedWorklist.length,
        transactions: targetedWorklist.map((tx) => ({
          id: tx.id,
          chargeDate: new Date(tx.date * 1000).toISOString().slice(0, 10),
          amount: tx.amount,
          merchantName: tx.merchant_name,
          name: tx.name,
        })),
      },
      null,
      2,
    ),
  );
  db.close();
  process.exit(targetedWorklist.length > 0 ? 0 : 1);
}

if (!existsSync(scrapePath)) {
  console.error(`scrape file not found: ${scrapePath}`);
  db.close();
  process.exit(1);
}

const scrape = JSON.parse(readFileSync(scrapePath, "utf8")) as Scrape;
const ordersById = new Map(
  scrape.orders
    .filter((order) => order.suggestedNote && !order.error)
    .map((order) => [order.order_id, order]),
);

const parseAmazonDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dayDiff = (a: Date, b: Date) =>
  Math.abs(Math.round((a.getTime() - b.getTime()) / 86_400_000));

const paymentChargeDate = (payment: Payment) => {
  const direct = parseAmazonDate(payment.payment_date);
  if (direct) return direct;
  const order = ordersById.get(payment.order_id);
  return parseAmazonDate(order?.order_date ?? null);
};

const updates: Match[] = [];
const skipped: { tx: AmazonWorklistTx; reason: string }[] = [];

for (const tx of targetedWorklist) {
  const txDate = new Date(tx.date * 1000);
  const amountCents = Math.round(tx.amount * 100);

  const candidates = scrape.payments.filter((payment) => {
    if (payment.amount_cents !== amountCents) return false;
    const chargeDate = paymentChargeDate(payment);
    if (!chargeDate) return false;
    return dayDiff(chargeDate, txDate) <= 3;
  });

  if (candidates.length === 0) {
    skipped.push({ tx, reason: "no payment match" });
    continue;
  }

  const uniqueOrderIds = [...new Set(candidates.map((payment) => payment.order_id))];
  if (uniqueOrderIds.length > 1) {
    skipped.push({ tx, reason: `ambiguous orders: ${uniqueOrderIds.join(", ")}` });
    continue;
  }

  const order = ordersById.get(uniqueOrderIds[0]!);
  if (!order?.suggestedNote) {
    skipped.push({ tx, reason: "missing suggested note" });
    continue;
  }

  updates.push({
    transactionId: tx.id,
    note: order.suggestedNote,
  });
}

console.log(
  JSON.stringify(
    {
      scrapePath,
      targets,
      worklist: worklist.length,
      targetedWorklist: targetedWorklist.length,
      matched: updates.length,
      skipped: skipped.length,
      updates,
      skippedDetails: skipped.map(({ tx, reason }) => ({
        id: tx.id,
        merchantName: tx.merchant_name,
        amount: tx.amount,
        reason,
      })),
    },
    null,
    2,
  ),
);

if (!dryRun && updates.length > 0) {
  const apply = Bun.spawnSync({
    cmd: ["bun", "scripts/apply-amazon-notes.ts", JSON.stringify(updates)],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  });
  db.close();
  process.exit(apply.exitCode ?? 1);
}

db.close();
