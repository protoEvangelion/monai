import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import {
  plaidItems,
  accounts,
  transactions,
  historicalBalances,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { plaidPost, deleteLocalItemData, mapAccountType } from "./plaid.utils";
import { seedDefaultCategories } from "./categories.seed";
import { syncTransactions } from "./plaid.sync.fns";
import { backfillHistoricalBalances } from "./plaid.balance.fns";

async function seedAccounts(accessToken: string, itemId: number) {
  const { db } = await import("../db");

  const { accounts: plaidAccounts } = await plaidPost("/accounts/get", {
    access_token: accessToken,
  });

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plaidAccounts as any[]).map((acc: any) =>
      db
        .insert(accounts)
        .values({
          name: acc.name,
          type: mapAccountType(acc.type),
          currentBalance: acc.balances.current ?? 0,
          plaidItemId: itemId,
          plaidAccountId: acc.account_id,
        })
        .onConflictDoUpdate({
          target: accounts.plaidAccountId,
          set: { name: acc.name, currentBalance: acc.balances.current ?? 0 },
        }),
    ),
  );
}

export const createLinkToken = createServerFn().handler(async () => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const data = await plaidPost("/link/token/create", {
    client_name: "Monai",
    user: { client_user_id: userId },
    products: ["transactions", "assets"],
    country_codes: ["US"],
    language: "en",
  });

  return data.link_token as string;
});

export const exchangePublicToken = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { publicToken, institutionName } = (ctx as any).data as {
    publicToken: string;
    institutionName?: string;
  };

  const { access_token, item_id } = await plaidPost(
    "/item/public_token/exchange",
    {
      public_token: publicToken,
    },
  );
  console.log(
    `[connect] token exchanged, item_id=${item_id}, institution=${institutionName ?? "unknown"}`,
  );

  const [item] = await db
    .insert(plaidItems)
    .values({
      itemId: item_id,
      accessToken: access_token,
      userId,
      institutionName: institutionName ?? null,
    })
    .returning();

  await seedAccounts(access_token, item.id);
  console.log(`[connect] accounts seeded`);
  await seedDefaultCategories(userId);
  await syncTransactions(access_token, item.id, userId, true);
  console.log(`[connect] transactions synced`);
  await backfillHistoricalBalances(access_token, item.id).catch((err) =>
    console.warn(
      "[connect] Assets backfill failed (product may not be enabled):",
      err?.message,
    ),
  );
  console.log(`[connect] done`);
});

export const removeItem = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number };

  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, id),
  });
  if (!item || item.userId !== userId) throw new Error("Item not found");

  try {
    await plaidPost("/item/remove", { access_token: item.accessToken });
  } catch (e) {
    console.error(
      "Failed to remove item from Plaid, proceeding with local deletion",
      e,
    );
  }

  await deleteLocalItemData(id);
  console.log(`Disconnected item ${id} and removed local data`);
});

export const deleteAccount = createServerFn().handler(async (ctx) => {
  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const { db } = await import("../db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = (ctx as any).data as { id: number };

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { plaidItem: true },
  });

  if (!account || account.plaidItem?.userId !== userId)
    throw new Error("Account not found");

  await db.delete(accounts).where(eq(accounts.id, id));
});
