import {
  plaidItems,
  accounts,
  transactions,
  historicalBalances,
  holdings,
} from "../db/schema";
import { eq } from "drizzle-orm";

export class PlaidApiError extends Error {
  constructor(
    message: string,
    public errorCode?: string,
    public errorType?: string,
  ) {
    super(message);
    this.name = "PlaidApiError";
  }
}

/**
 * Resolve Plaid credentials across both env naming conventions.
 *
 * - Local: `scripts/dev.ts` maps PLAID_SANDBOX_* / PLAID_PRODUCTION_* down to
 *   PLAID_ENV + PLAID_SECRET before Vite starts.
 * - Vercel: only PLAID_PRODUCTION_ENV + PLAID_PRODUCTION_SECRET are set (they
 *   hold real bank keys), so fall back to those instead of silently using
 *   sandbox and rejecting every stored production token.
 */
export function resolvePlaidCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const env =
    process.env.PLAID_ENV?.trim() ||
    process.env.PLAID_PRODUCTION_ENV?.trim() ||
    "sandbox";
  const secret =
    process.env.PLAID_SECRET?.trim() || process.env.PLAID_PRODUCTION_SECRET?.trim();
  return { clientId, env, secret };
}

export const plaidPost = async (path: string, body: object) => {
  const { clientId, env, secret } = resolvePlaidCredentials();
  if (!clientId || !secret) {
    throw new Error(
      "Missing Plaid env vars — need PLAID_CLIENT_ID plus PLAID_SECRET (or PLAID_PRODUCTION_SECRET).",
    );
  }
  const base = `https://${env}.plaid.com`;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      ...body,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new PlaidApiError(
      data.error_message ?? `Plaid error on ${path}`,
      data.error_code,
      data.error_type,
    );
  }
  return data;
};

export const isMissingPlaidItemError = (error: unknown) => {
  if (error instanceof PlaidApiError && error.errorCode === "ITEM_NOT_FOUND")
    return true;
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? "";
  return (
    msg.includes("item you requested cannot be found") ||
    msg.includes("item does not exist")
  );
};

export const isPlaidReconnectRequiredError = (error: unknown) =>
  error instanceof PlaidApiError && error.errorCode === "ITEM_LOGIN_REQUIRED";

/**
 * Plaid invalidates an in-flight pagination sequence when the underlying
 * transaction data changes while you are walking `/transactions/sync` pages.
 * The documented fix is to restart pagination from the last saved cursor, so
 * this is retryable rather than fatal.
 */
export const isPlaidPaginationMutationError = (error: unknown) => {
  if (
    error instanceof PlaidApiError &&
    error.errorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
  ) {
    return true;
  }
  const msg = (error as { message?: string })?.message ?? "";
  return /restart pagination/i.test(msg);
};

/**
 * Plaid access tokens are bound to the environment that created them
 * (sandbox vs production). If the server is configured for the wrong
 * environment, every stored item fails with INVALID_ACCESS_TOKEN — this is a
 * config problem, not a bank-login problem, so it deserves its own message.
 */
export const isPlaidEnvMismatchError = (error: unknown) => {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? "";
  return msg.includes("wrong plaid environment");
};

export async function deleteLocalItemData(itemId: number) {
  const { db } = await import("../db");

  const itemAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });

  await Promise.all(
    itemAccounts.flatMap((account) => [
      db.delete(holdings).where(eq(holdings.accountId, account.id)),
      db
        .delete(historicalBalances)
        .where(eq(historicalBalances.accountId, account.id)),
      db.delete(transactions).where(eq(transactions.accountId, account.id)),
    ]),
  );

  await db.delete(accounts).where(eq(accounts.plaidItemId, itemId));
  await db.delete(plaidItems).where(eq(plaidItems.id, itemId));
}

export function mapAccountType(plaidType: string): string {
  const map: Record<string, string> = {
    depository: "cash",
    credit: "credit",
    investment: "investment",
    loan: "loan",
    other: "cash",
  };
  return map[plaidType] ?? "cash";
}

/** Pull latest balances from Plaid and update local accounts. */
export async function refreshAccountBalances(accessToken: string, itemId: number) {
  const { db } = await import("../db");

  const { accounts: plaidAccounts } = await plaidPost("/accounts/get", {
    access_token: accessToken,
  });

  const localAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const byPlaidId = new Map(
    localAccounts
      .filter((account) => account.plaidAccountId)
      .map((account) => [account.plaidAccountId!, account]),
  );

  let updated = 0;
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plaidAccounts as any[]).map(async (plaidAccount: any) => {
      const local = byPlaidId.get(plaidAccount.account_id);
      if (!local) return;
      const balance = plaidAccount.balances?.current;
      if (balance == null) return;
      await db
        .update(accounts)
        .set({
          name: plaidAccount.name ?? local.name,
          currentBalance: balance,
          type: mapAccountType(plaidAccount.type) || local.type,
        })
        .where(eq(accounts.id, local.id));
      updated += 1;
    }),
  );

  console.log(`[balances] refreshed ${updated} accounts for item ${itemId}`);
  return updated;
}
