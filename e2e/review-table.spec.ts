import { test, expect } from "@playwright/test";

/**
 * ReviewTable E2E tests.
 *
 * "dashboard" tests the review-mode table (showAll=false) — AI Categorize +
 * Mark Reviewed buttons are visible here.
 *
 * "transactions" tests the full history table (showAll=true) — AI Categorize
 * remains visible, Mark Reviewed is hidden, and filters still work.
 */

test.describe("ReviewTable", () => {
  // ─── Transactions page (showAll) ────────────────────────────────────────
  test.describe("transactions", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/transactions");
      await page.waitForSelector('[aria-label="Select transactions"]', { timeout: 15_000 });
    });

    test("renders select-all checkbox and label", async ({ page }) => {
      await expect(page.getByRole("checkbox", { name: "Select transactions" })).toBeVisible();
      await expect(page.getByText("Select first 100")).toBeVisible();
    });

    test("AI action is visible and Mark Reviewed is hidden", async ({ page }) => {
      await expect(page.getByRole("button", { name: /AI Categorize/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Mark Reviewed/ })).toBeHidden();
    });

    test("selecting all transactions updates the label", async ({ page }) => {
      await page.getByRole("checkbox", { name: "Select transactions" }).click();
      await expect(page.getByText(/selected/)).toBeVisible();
    });

    test("clicking select-all twice clears selection", async ({ page }) => {
      const cb = page.getByRole("checkbox", { name: "Select transactions" });
      await cb.click();
      await expect(page.getByText(/selected/)).toBeVisible();
      await cb.click();
      await expect(page.getByText("Select first 100")).toBeVisible();
    });

    test("non-regular rows show type instead of category", async ({ page }) => {
      await page.getByPlaceholder("Search").fill("Online Transfer");
      const transferRow = page.getByTestId("transaction-row-4");
      await expect(transferRow).toContainText("Transfer");
      await expect(transferRow).not.toContainText("Groceries");

      await page.getByPlaceholder("Search").fill("Payroll");
      const incomeRow = page.getByTestId("transaction-row-5");
      await expect(incomeRow).toContainText("Income");
      await expect(incomeRow).not.toContainText("Groceries");
    });

    test("shows transaction notes", async ({ page }) => {
      await expect(page.getByTestId("transaction-row-1")).toContainText("Weekly groceries");
    });

    test("shows date as a column", async ({ page }) => {
      await expect(page.getByRole("columnheader", { name: "Date" })).toBeVisible();
      await expect(page.getByTestId("transaction-row-1").getByTestId("transaction-date")).toBeVisible();
      await expect(page.getByText("Yesterday")).toBeHidden();
    });

    test("shows name by default and optional Plaid columns on demand", async ({ page }) => {
      await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Merchant" })).toBeHidden();
      await expect(page.getByRole("columnheader", { name: "Datetime" })).toBeHidden();
      await expect(page.getByRole("columnheader", { name: "Location" })).toBeHidden();

      await page.getByText("Columns", { exact: true }).click();
      await page.getByLabel("Merchant", { exact: true }).check();
      await page.getByLabel("Datetime", { exact: true }).check();
      await page.getByLabel("Location", { exact: true }).check();

      await expect(page.getByRole("columnheader", { name: "Merchant" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Datetime" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Location" })).toBeVisible();
    });

    test("search, category filter, and date filter narrow table rows", async ({ page }) => {
      await page.getByPlaceholder("Search").fill("Whole");
      await expect(page.getByTestId("transaction-row-1")).toBeVisible();
      await expect(page.getByTestId("transaction-row-2")).toBeHidden();

      await page.getByPlaceholder("Search").clear();
      await page.getByRole("combobox").selectOption("income");
      await expect(page.getByTestId("transaction-row-5")).toBeVisible();
      await expect(page.getByTestId("transaction-row-1")).toBeHidden();

      await page.getByRole("combobox").selectOption("cat:2");
      await expect(page.getByTestId("transaction-row-1")).toBeVisible();
      await expect(page.getByTestId("transaction-row-5")).toBeHidden();

      const rowDate = await page
        .getByTestId("transaction-row-1")
        .getByTestId("transaction-date")
        .getAttribute("data-date");
      await page.getByLabel("Date", { exact: true }).fill(rowDate ?? "");
      await expect(page.getByTestId("transaction-row-1")).toBeVisible();
      await expect(page.getByTestId("transaction-row-2")).toBeHidden();
    });

    test("shows reviewed transactions on the full transactions page", async ({ page }) => {
      await page.getByPlaceholder("Search").fill("Reviewed Coffee");
      await expect(page.getByTestId("transaction-row-6")).toBeVisible();
    });

    test("clicking a transaction row selects it", async ({ page }) => {
      // Use aria-label prefix that excludes the select-all ("Select transactions")
      const rowCheckboxes = page.getByRole("checkbox", { name: /^Select transaction \w/ });
      const count = await rowCheckboxes.count();
      if (count === 0) test.skip();

      await rowCheckboxes.first().click();
      await expect(rowCheckboxes.first()).toBeChecked();
      await expect(page.getByText(/^1 selected$/)).toBeVisible();
    });
  });

  // ─── Dashboard page (review mode, showAll=false) ─────────────────────────
  test.describe("dashboard", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.waitForSelector('[aria-label="Select transactions"]', { timeout: 15_000 });
    });

    test("renders select-all checkbox and label", async ({ page }) => {
      await expect(page.getByRole("checkbox", { name: "Select transactions" })).toBeVisible();
      await expect(page.getByText("Select all")).toBeVisible();
    });

    test("AI Categorize button is visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /AI Categorize/ })).toBeVisible();
    });

    test("shows transaction notes", async ({ page }) => {
      await expect(page.getByText("Weekly groceries")).toBeVisible();
    });

    test("auto-applies the not reviewed filter", async ({ page }) => {
      await expect(page.getByText("Reviewed Coffee")).toBeHidden();
    });

    test("category picker shows income and transfer before categories", async ({ page }) => {
      const categoryButtons = page
        .locator('[data-testid^="transaction-row-"]')
        .getByRole("button", { name: /Groceries/ });
      const count = await categoryButtons.count();
      if (count === 0) test.skip();

      await categoryButtons.first().click();
      const picker = page.locator('[role="dialog"]').filter({ hasText: "Transfer" });
      await expect(picker).toBeVisible();

      const text = await picker.innerText();
      expect(text.indexOf("Income")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("Transfer")).toBeGreaterThan(text.indexOf("Income"));
      expect(text.indexOf("Food")).toBeGreaterThan(text.indexOf("Transfer"));
    });

    test("Mark Reviewed button is visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Mark Reviewed/ })).toBeVisible();
    });

    test("selecting all updates label and shows counts on buttons", async ({ page }) => {
      await page.getByRole("checkbox", { name: "Select transactions" }).click();
      await expect(page.getByText(/selected/)).toBeVisible();
      await expect(page.getByRole("button", { name: /AI Categorize \(\d+\)/ })).toBeVisible();
    });

    test("clicking select-all twice clears selection", async ({ page }) => {
      const cb = page.getByRole("checkbox", { name: "Select transactions" });
      await cb.click();
      await expect(page.getByText(/selected/)).toBeVisible();
      await cb.click();
      await expect(page.getByText("Select all")).toBeVisible();
    });

    test("clicking a transaction row selects it and updates button labels", async ({ page }) => {
      const rowCheckboxes = page.getByRole("checkbox", { name: /^Select transaction \w/ });
      const count = await rowCheckboxes.count();
      if (count === 0) test.skip();

      await rowCheckboxes.first().click();
      await expect(rowCheckboxes.first()).toBeChecked();
      await expect(page.getByText(/^1 selected$/)).toBeVisible();
      await expect(page.getByRole("button", { name: /AI Categorize \(1\)/ })).toBeVisible();
    });
  });
});
