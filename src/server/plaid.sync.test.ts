import { describe, expect, test } from "vitest";

import { isPlaidPaginationMutationError, isPostedTransaction, PlaidApiError } from "./plaid.utils";
import { isIncomingSyncDuplicate, withoutRemovedTransactions } from "./transactions.dedupe";

describe("Plaid pagination mutation detection", () => {
  test("matches the documented error code", () => {
    expect(
      isPlaidPaginationMutationError(
        new PlaidApiError(
          "Underlying transaction data changed since last page was fetched. Please restart pagination from last update.",
          "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
          "TRANSACTIONS_ERROR",
        ),
      ),
    ).toBe(true);
  });

  test("matches the message when the code is missing", () => {
    expect(
      isPlaidPaginationMutationError(
        new Error(
          "Underlying transaction data changed since last page was fetched. Please restart pagination from last update.",
        ),
      ),
    ).toBe(true);
  });

  test("leaves other Plaid failures alone", () => {
    expect(
      isPlaidPaginationMutationError(
        new PlaidApiError("the login details have changed", "ITEM_LOGIN_REQUIRED"),
      ),
    ).toBe(false);
    expect(isPlaidPaginationMutationError(new Error("network down"))).toBe(false);
    expect(isPlaidPaginationMutationError(undefined)).toBe(false);
  });
});

describe("pending transactions are never stored", () => {
  test("drops pending rows and keeps posted ones", () => {
    expect(isPostedTransaction({ pending: true })).toBe(false);
    expect(isPostedTransaction({ pending: false })).toBe(true);
    expect(isPostedTransaction({})).toBe(true);
    expect(isPostedTransaction(undefined)).toBe(true);
  });
});

describe("dedupe snapshot after a removal", () => {
  const pendingTwin = {
    accountId: 76,
    amount: 17.93,
    date: new Date("2026-11-18T00:00:00Z"),
    vendor: "McDonald's",
    plaidTransactionId: "pending-id",
  };
  const posted = {
    accountId: 76,
    amount: 17.93,
    // Plaid's authorized_date is one day before the pending row's date.
    date: new Date("2026-11-17T00:00:00Z"),
    vendor: "McDonald's",
  };

  test("a deleted pending row would otherwise reject its posted replacement", () => {
    const stale = [{ ...pendingTwin, claimed: false }];
    expect(isIncomingSyncDuplicate(stale[0], posted)).toBe(true);
  });

  test("removing it from the snapshot lets the posted row through", () => {
    const stale = [{ ...pendingTwin, claimed: false }];
    const pruned = withoutRemovedTransactions(stale, ["pending-id"]);
    expect(pruned).toHaveLength(0);
    expect(pruned.some((row) => isIncomingSyncDuplicate(row, posted))).toBe(false);
  });

  test("rows with no plaid id are never pruned", () => {
    const manual = { ...pendingTwin, plaidTransactionId: null, claimed: false };
    expect(withoutRemovedTransactions([manual], ["pending-id"])).toHaveLength(1);
    expect(withoutRemovedTransactions([manual], [])).toHaveLength(1);
  });
});
