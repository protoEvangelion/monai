import {
  plaidItems,
  accounts,
  transactions,
  historicalBalances,
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

export const plaidPost = async (path: string, body: object) => {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = process.env;
  if (!PLAID_CLIENT_ID || !PLAID_SECRET || !PLAID_ENV) {
    throw new Error(
      "Missing Plaid env vars — check PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV in .env.local",
    );
  }
  const base = `https://${PLAID_ENV}.plaid.com`;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
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

export async function deleteLocalItemData(itemId: number) {
  const { db } = await import("../db");

  const itemAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });

  await Promise.all(
    itemAccounts.flatMap((account) => [
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
