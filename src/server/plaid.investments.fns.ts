import { eq, inArray } from "drizzle-orm";
import { accounts, holdings, securities } from "../db/schema";
import { isMissingPlaidItemError, plaidPost, PlaidApiError } from "./plaid.utils";

function isInvestmentsUnavailableError(error: unknown) {
  if (error instanceof PlaidApiError) {
    const code = error.errorCode ?? "";
    if (
      code === "PRODUCTS_NOT_SUPPORTED" ||
      code === "PRODUCT_NOT_READY" ||
      code === "INVALID_PRODUCT" ||
      code === "NO_INVESTMENT_ACCOUNTS" ||
      code === "ADDITIONAL_CONSENT_REQUIRED" ||
      code === "PRODUCT_NOT_ENABLED" ||
      code === "INSUFFICIENT_CREDENTIALS"
    ) {
      return true;
    }
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("product_investments") ||
    message.includes("investments product") ||
    message.includes("user consent") ||
    message.includes("additional consent")
  );
}

/** Sync securities + holdings for a Plaid item. No-ops when Investments product isn't available. */
export async function syncInvestmentsHoldings(accessToken: string, itemId: number) {
  const { db } = await import("../db");

  let data: {
    accounts?: any[];
    holdings?: any[];
    securities?: any[];
  };
  try {
    data = await plaidPost("/investments/holdings/get", {
      access_token: accessToken,
    });
  } catch (error) {
    if (isInvestmentsUnavailableError(error) || isMissingPlaidItemError(error)) {
      return { synced: false as const, holdingCount: 0 };
    }
    throw error;
  }

  const itemAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  const accountByPlaidId = new Map(
    itemAccounts
      .filter((account) => account.plaidAccountId)
      .map((account) => [account.plaidAccountId!, account]),
  );

  // Refresh balances from the holdings response when present
  await Promise.all(
    (data.accounts ?? []).map(async (plaidAccount: any) => {
      const local = accountByPlaidId.get(plaidAccount.account_id);
      if (!local) return;
      const balance = plaidAccount.balances?.current ?? local.currentBalance;
      await db
        .update(accounts)
        .set({
          name: plaidAccount.name ?? local.name,
          currentBalance: balance,
          type: local.type === "investment" ? local.type : "investment",
        })
        .where(eq(accounts.id, local.id));
      local.currentBalance = balance;
    }),
  );

  const securityRows = data.securities ?? [];
  const securityIdByPlaidId = new Map<string, number>();

  for (const security of securityRows) {
    const [row] = await db
      .insert(securities)
      .values({
        plaidSecurityId: security.security_id,
        name: security.name ?? security.ticker_symbol ?? "Unknown security",
        tickerSymbol: security.ticker_symbol ?? null,
        type: security.type ?? null,
        closePrice: security.close_price ?? null,
        isoCurrencyCode: security.iso_currency_code ?? null,
      })
      .onConflictDoUpdate({
        target: securities.plaidSecurityId,
        set: {
          name: security.name ?? security.ticker_symbol ?? "Unknown security",
          tickerSymbol: security.ticker_symbol ?? null,
          type: security.type ?? null,
          closePrice: security.close_price ?? null,
          isoCurrencyCode: security.iso_currency_code ?? null,
        },
      })
      .returning();
    securityIdByPlaidId.set(security.security_id, row.id);
  }

  const localAccountIds = itemAccounts.map((account) => account.id);
  if (localAccountIds.length) {
    await db.delete(holdings).where(inArray(holdings.accountId, localAccountIds));
  }

  const holdingRows = (data.holdings ?? [])
    .map((holding: any) => {
      const account = accountByPlaidId.get(holding.account_id);
      const securityId = securityIdByPlaidId.get(holding.security_id);
      if (!account || !securityId) return null;
      return {
        accountId: account.id,
        securityId,
        quantity: Number(holding.quantity) || 0,
        institutionPrice:
          holding.institution_price != null ? Number(holding.institution_price) : null,
        institutionValue: Number(holding.institution_value) || 0,
        costBasis: holding.cost_basis != null ? Number(holding.cost_basis) : null,
        isoCurrencyCode: holding.iso_currency_code ?? null,
        asOf: holding.institution_price_as_of
          ? new Date(holding.institution_price_as_of)
          : new Date(),
      };
    })
    .filter(Boolean) as Array<{
    accountId: number;
    securityId: number;
    quantity: number;
    institutionPrice: number | null;
    institutionValue: number;
    costBasis: number | null;
    isoCurrencyCode: string | null;
    asOf: Date;
  }>;

  if (holdingRows.length) {
    await db.insert(holdings).values(holdingRows);
  }

  console.log(`[investments] synced ${holdingRows.length} holdings for item ${itemId}`);
  return { synced: true as const, holdingCount: holdingRows.length };
}

export async function clearHoldingsForAccounts(accountIds: number[]) {
  if (!accountIds.length) return;
  const { db } = await import("../db");
  await db.delete(holdings).where(inArray(holdings.accountId, accountIds));
}

export async function clearHoldingsForItem(itemId: number) {
  const { db } = await import("../db");
  const itemAccounts = await db.query.accounts.findMany({
    where: eq(accounts.plaidItemId, itemId),
  });
  await clearHoldingsForAccounts(itemAccounts.map((account) => account.id));
}
