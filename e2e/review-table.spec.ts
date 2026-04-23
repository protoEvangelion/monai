import { test, expect } from '@playwright/test'

/**
 * ReviewTable E2E tests.
 *
 * "dashboard" tests the review-mode table (showAll=false) — AI Categorize +
 * Mark Reviewed buttons are visible here.
 *
 * "transactions" tests the full history table (showAll=true) — no action
 * buttons, but pagination, search, and row selection still work.
 */

test.describe('ReviewTable', () => {
  // ─── Transactions page (showAll) ────────────────────────────────────────
  test.describe('transactions', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/transactions')
      await page.waitForSelector('[aria-label="Select transactions"]', { timeout: 15_000 })
    })

    test('renders select-all checkbox and label', async ({ page }) => {
      await expect(page.getByRole('checkbox', { name: 'Select transactions' })).toBeVisible()
      await expect(page.getByText('Select all')).toBeVisible()
    })

    test('action buttons are hidden (showAll mode)', async ({ page }) => {
      await expect(page.getByRole('button', { name: /AI Categorize/ })).not.toBeVisible()
      await expect(page.getByRole('button', { name: /Mark Reviewed/ })).not.toBeVisible()
    })

    test('selecting all transactions updates the label', async ({ page }) => {
      await page.getByRole('checkbox', { name: 'Select transactions' }).click()
      await expect(page.getByText(/selected/)).toBeVisible()
    })

    test('clicking select-all twice clears selection', async ({ page }) => {
      const cb = page.getByRole('checkbox', { name: 'Select transactions' })
      await cb.click()
      await expect(page.getByText(/selected/)).toBeVisible()
      await cb.click()
      await expect(page.getByText('Select all')).toBeVisible()
    })

    test('clicking a transaction row selects it', async ({ page }) => {
      // Use aria-label prefix that excludes the select-all ("Select transactions")
      const rowCheckboxes = page.getByRole('checkbox', { name: /^Select transaction \w/ })
      const count = await rowCheckboxes.count()
      if (count === 0) test.skip()

      await rowCheckboxes.first().click()
      await expect(rowCheckboxes.first()).toBeChecked()
      await expect(page.getByText(/^1 selected$/)).toBeVisible()
    })
  })

  // ─── Dashboard page (review mode, showAll=false) ─────────────────────────
  test.describe('dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('[aria-label="Select transactions"]', { timeout: 15_000 })
    })

    test('renders select-all checkbox and label', async ({ page }) => {
      await expect(page.getByRole('checkbox', { name: 'Select transactions' })).toBeVisible()
      await expect(page.getByText('Select all')).toBeVisible()
    })

    test('AI Categorize button is visible', async ({ page }) => {
      await expect(page.getByRole('button', { name: /AI Categorize/ })).toBeVisible()
    })

    test('Mark Reviewed button is visible', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Mark Reviewed/ })).toBeVisible()
    })

    test('selecting all updates label and shows counts on buttons', async ({ page }) => {
      await page.getByRole('checkbox', { name: 'Select transactions' }).click()
      await expect(page.getByText(/selected/)).toBeVisible()
      await expect(page.getByRole('button', { name: /AI Categorize \(\d+\)/ })).toBeVisible()
    })

    test('clicking select-all twice clears selection', async ({ page }) => {
      const cb = page.getByRole('checkbox', { name: 'Select transactions' })
      await cb.click()
      await expect(page.getByText(/selected/)).toBeVisible()
      await cb.click()
      await expect(page.getByText('Select all')).toBeVisible()
    })

    test('clicking a transaction row selects it and updates button labels', async ({ page }) => {
      const rowCheckboxes = page.getByRole('checkbox', { name: /^Select transaction \w/ })
      const count = await rowCheckboxes.count()
      if (count === 0) test.skip()

      await rowCheckboxes.first().click()
      await expect(rowCheckboxes.first()).toBeChecked()
      await expect(page.getByText(/^1 selected$/)).toBeVisible()
      await expect(page.getByRole('button', { name: /AI Categorize \(1\)/ })).toBeVisible()
    })
  })
})
