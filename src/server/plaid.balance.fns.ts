import { accounts, transactions, historicalBalances } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  plaidPost,
  isMissingPlaidItemError,
  deleteLocalItemData,
} from "./plaid.utils";

export async function backfillHistoricalBalances(
  accessToken: string,
  itemId: number,
) {
  const { db } = await import("../db");

  const dbAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  if (dbAccounts.length === 0) {
    console.log("[backfill] no accounts found, skipping");
    return;
  }

  const accountMap = new Map(dbAccounts.map((a) => [a.plaidAccountId, a.id]));
  console.log(
    `[backfill] requesting asset report for ${dbAccounts.length} accounts (730 days)`,
  );

  const { asset_report_token } = await plaidPost("/asset_report/create", {
    access_tokens: [accessToken],
    days_requested: 730,
  });
  console.log("[backfill] report created, polling...");

  let report: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      report = await plaidPost("/asset_report/get", { asset_report_token });
      console.log(`[backfill] report ready (attempt ${attempt + 1})`);
      break;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      console.log(`[backfill] attempt ${attempt + 1}: not ready (${msg})`);
    }
  }
  if (!report) {
    console.warn("[backfill] report never became ready, giving up");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportItems: any[] = (report as any).report?.items ?? [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const monthTargets = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    return {
      monthStart: d,
      monthEnd: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  });

  const insertOps = reportItems.flatMap((reportItem: any) =>
    (reportItem.accounts ?? []).flatMap((acct: any) => {
      const dbAccountId = accountMap.get(acct.account_id);
      if (!dbAccountId) return [];

      const hbList: any[] = acct.historical_balances ?? [];
      if (hbList.length === 0) return [];

      return monthTargets.flatMap((target) => {
        const monthly = hbList.filter((hb: any) => {
          const t = new Date(hb.date).getTime();
          return (
            t >= target.monthStart.getTime() && t < target.monthEnd.getTime()
          );
        });
        if (monthly.length === 0) return [];

        const selected = monthly.reduce((latest: any, hb: any) =>
          new Date(hb.date).getTime() > new Date(latest.date).getTime()
            ? hb
            : latest,
        );

        return [
          db
            .insert(historicalBalances)
            .values({
              accountId: dbAccountId,
              date: target.monthStart,
              balance: selected.current ?? 0,
              source: "plaid_assets",
            })
            .onConflictDoNothing(),
        ];
      });
    }),
  );

  const results = await Promise.all(insertOps);
  console.log(
    `[backfill] stored up to monthly points for last 24 months (${results.length} inserts attempted)`,
  );
}
