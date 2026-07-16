import { expect, type Page } from "@playwright/test";

export async function waitForReviewTable(page: Page) {
  await page.waitForSelector('[data-testid^="transaction-row-"]', { timeout: 15_000 });
}

export async function selectAllTransactions(page: Page) {
  await page.getByRole("checkbox", { name: "Select transactions" }).click();
}

export async function fillNameFilter(page: Page, text: string) {
  const nameHeader = page.getByRole("columnheader", { name: "Name" });
  const input = nameHeader.getByRole("textbox");
  if (text) {
    await input.fill(text);
  } else {
    await input.clear();
  }
}

export async function selectCategoryFilter(page: Page, optionLabel: string | RegExp) {
  const categoryHeader = page.getByRole("columnheader", { name: /Category/ });
  await categoryHeader.getByRole("textbox").click();
  const exact = typeof optionLabel === "string";
  await page.getByRole("option", { name: optionLabel, exact }).click();
}

export async function toggleOptionalColumns(page: Page, labels: string[]) {
  await page.getByRole("button", { name: "Show/Hide columns" }).click();
  const menu = page.getByRole("menu", { name: "Show/Hide columns" });
  for (const label of labels) {
    const row = menu.getByRole("menuitem").filter({ has: page.getByText(label, { exact: true }) });
    await row.locator("label").click();
  }
  await page.keyboard.press("Escape");
}

export async function showAllColumns(page: Page) {
  await page.getByRole("button", { name: "Show/Hide columns" }).click();
  await page
    .getByRole("menu", { name: "Show/Hide columns" })
    .getByRole("button", { name: "Show all" })
    .click();
  await page.keyboard.press("Escape");
}

const selectionToolbar = (page: Page) =>
  page.locator(".fixed.bottom-4").filter({ hasText: "selected" });

export async function expectSelectionCount(page: Page, count: number) {
  await expect(selectionToolbar(page).getByText(`${count} selected`, { exact: true })).toBeVisible();
}

export async function expectNoSelection(page: Page) {
  await expect(selectionToolbar(page)).toBeHidden();
}

export async function expectAICategorizeButton(page: Page, count?: number) {
  const pattern =
    count === undefined ? /AI Categorize \d+ selected/ : new RegExp(`AI Categorize ${count} selected`);
  await expect(page.getByRole("button", { name: pattern })).toBeVisible();
}
