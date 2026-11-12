import { describe, expect, test } from "vitest";

import { isPlaidPaginationMutationError, PlaidApiError } from "./plaid.utils";

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
