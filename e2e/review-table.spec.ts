import { test, expect } from "@playwright/test";
import {
  expectAICategorizeButton,
  expectNoSelection,
  expectSelectionCount,
  fillNameFilter,
  selectAllTransactions,
  selectCategoryFilter,
  showAllColumns,
  toggleOptionalColumns,
  waitForReviewTable,
} from "./helpers/review-table";

/**
 * ReviewTable E2E tests (Mantine React Table).
 *
 * "dashboard" tests review-mode (showAll=false).
 * "transactions" tests full history (showAll=true).
 */

test.describe("ReviewTable", () => {
  test.describe("transactions", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/transactions");
      await waitForReviewTable(page);
    });

    test("renders select-all checkbox", async ({ page }) => {
      await expect(page.getByRole("checkbox", { name: "Select transactions" })).toBeVisible();
    });

    test("AI action appears after selection and Mark Reviewed stays hidden", async ({ page }) => {
      await expect(page.getByRole("button", { name: /AI Categorize/ })).toBeHidden();
      await selectAllTransactions(page);
      await expect(page.getByRole("button", { name: /AI Categorize/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Mark Reviewed|Mark reviewed/i })).toBeHidden();
    });

    test("selecting all transactions updates the label", async ({ page }) => {
      await selectAllTransactions(page);
      await expectSelectionCount(page, 6);
    });

    test("clicking select-all twice clears selection", async ({ page }) => {
      const cb = page.getByRole("checkbox", { name: "Select transactions" });
      await cb.click();
      await expectSelectionCount(page, 6);
      await cb.click();
      await expectNoSelection(page);
    });

    test("non-regular rows show type instead of category", async ({ page }) => {
      await fillNameFilter(page, "Online Transfer");
      const transferRow = page.getByTestId("transaction-row-4");
      await expect(transferRow).toContainText("Transfer");
      await expect(transferRow).not.toContainText("Groceries");

      await fillNameFilter(page, "Payroll");
      const incomeRow = page.getByTestId("transaction-row-5");
      await expect(incomeRow).toContainText("Income");
      await expect(incomeRow).not.toContainText("Groceries");
    });

    test("shows transaction notes when note column is visible", async ({ page }) => {
      await toggleOptionalColumns(page, ["Note"]);
      await expect(page.getByRole("columnheader", { name: "Note" })).toBeVisible();
      await expect(page.getByTestId("transaction-note-1")).toHaveValue("Weekly groceries");
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

      await showAllColumns(page);

      await expect(page.getByRole("columnheader", { name: "Merchant" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Datetime" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Location" })).toBeVisible();
    });

    test("name and category filters narrow table rows", async ({ page }) => {
      await fillNameFilter(page, "Whole");
      await expect(page.getByTestId("transaction-row-1")).toBeVisible();
      await expect(page.getByTestId("transaction-row-2")).toBeHidden();

      await fillNameFilter(page, "");
      await selectCategoryFilter(page, "Income");
      await expect(page.getByTestId("transaction-row-5")).toBeVisible();
      await expect(page.getByTestId("transaction-row-1")).toBeHidden();

      await selectCategoryFilter(page, /Groceries/);
      await expect(page.getByTestId("transaction-row-1")).toBeVisible();
      await expect(page.getByTestId("transaction-row-5")).toBeHidden();
    });

    test("shows reviewed transactions on the full transactions page", async ({ page }) => {
      await fillNameFilter(page, "Reviewed Coffee");
      await expect(page.getByTestId("transaction-row-6")).toBeVisible();
    });

    test("clicking a row checkbox selects it", async ({ page }) => {
      const rowCheckboxes = page.getByRole("checkbox", { name: /^Select transaction \w/ });
      const count = await rowCheckboxes.count();
      if (count === 0) test.skip();

      await rowCheckboxes.first().click();
      await expect(rowCheckboxes.first()).toBeChecked();
      await expectSelectionCount(page, 1);
    });

    test("note column supports inline editing", async ({ page }) => {
      await toggleOptionalColumns(page, ["Note"]);
      const noteInput = page.getByTestId("transaction-note-1");
      await expect(noteInput).toHaveValue("Weekly groceries");
      await noteInput.fill("Updated grocery note");
      await noteInput.blur();
      await expect(noteInput).toHaveValue("Updated grocery note");
      await noteInput.fill("Weekly groceries");
      await noteInput.blur();
      await expect(noteInput).toHaveValue("Weekly groceries");
    });
  });

  test.describe("dashboard", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await waitForReviewTable(page);
    });

    test("renders select-all checkbox", async ({ page }) => {
      await expect(page.getByRole("checkbox", { name: "Select transactions" })).toBeVisible();
    });

    test("AI Categorize button appears after selection", async ({ page }) => {
      await selectAllTransactions(page);
      await expect(page.getByRole("button", { name: /AI Categorize/ })).toBeVisible();
    });

    test("shows transaction notes when note column is visible", async ({ page }) => {
      await toggleOptionalColumns(page, ["Note"]);
      await expect(page.getByRole("columnheader", { name: "Note" })).toBeVisible();
      await expect(page.getByTestId("transaction-note-1")).toHaveValue("Weekly groceries");
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

    test("Mark Reviewed button appears after selection", async ({ page }) => {
      await selectAllTransactions(page);
      await expect(page.getByRole("button", { name: /Mark Reviewed|Mark reviewed/i })).toBeVisible();
    });

    test("selecting all updates label and shows counts on buttons", async ({ page }) => {
      await selectAllTransactions(page);
      await expectSelectionCount(page, 5);
      await expectAICategorizeButton(page, 5);
    });

    test("clicking select-all twice clears selection", async ({ page }) => {
      const cb = page.getByRole("checkbox", { name: "Select transactions" });
      await cb.click();
      await expectSelectionCount(page, 5);
      await cb.click();
      await expectNoSelection(page);
    });

    test("clicking a row checkbox selects it and updates button labels", async ({ page }) => {
      const rowCheckboxes = page.getByRole("checkbox", { name: /^Select transaction \w/ });
      const count = await rowCheckboxes.count();
      if (count === 0) test.skip();

      await rowCheckboxes.first().click();
      await expect(rowCheckboxes.first()).toBeChecked();
      await expectSelectionCount(page, 1);
      await expectAICategorizeButton(page, 1);
    });
  });
});
