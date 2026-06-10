import { expect, test } from '@playwright/test'

test.describe('app shell smoke', () => {
  test('navigates every sidebar route', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Transactions to review' })).toBeVisible()

    const routes = [
      { name: 'Transactions', heading: 'Transactions' },
      { name: 'Accounts', heading: 'Accounts' },
      { name: 'Investments', heading: 'Investments' },
      { name: 'Categories', heading: 'Categories' },
      { name: 'Recurrings', heading: 'Recurrings', exact: true },
      { name: 'Dashboard', heading: 'Transactions to review' },
    ]

    const sidebar = page.getByRole('navigation')
    for (const route of routes) {
      await sidebar.getByRole('link', { name: route.name }).click()
      await expect(page.getByRole('heading', { name: route.heading, exact: route.exact })).toBeVisible()
    }
  })

  test('header theme controls are interactive', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Theme palette' }).click()
    await page.getByRole('menuitem', { name: 'Graphite' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite')

    await page.getByRole('button', { name: 'Theme palette' }).click()
    await page.getByRole('menuitem', { name: 'Ocean' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')

    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean-dark')
  })

  test('settings modal opens, switches tabs, and closes', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'Connections' }).click()
    await expect(page.getByText('Needs attention')).toBeVisible()

    await page.getByRole('button', { name: 'About' }).click()
    await expect(page.getByText('Version')).toBeVisible()

    await page.getByRole('button', { name: 'Close settings' }).last().click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden()
  })

  test('transactions controls search, filter, and open the category picker', async ({ page }) => {
    await page.goto('/transactions')

    await page.getByPlaceholder('Search').fill('Whole')
    await expect(page.getByRole('checkbox', { name: 'Select transaction Whole Foods' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Select transaction Uber Eats' })).toBeHidden()

    await page.getByPlaceholder('Search').clear()
    await page.getByRole('combobox').selectOption('income')
    await expect(page.getByTestId('transaction-row-5')).toBeVisible()
    await expect(page.getByTestId('transaction-row-1')).toBeHidden()

    await page.getByRole('combobox').selectOption('cat:2')
    await expect(page.getByTestId('transaction-row-1')).toBeVisible()

    await page
      .locator('[data-testid="transaction-row-1"]')
      .getByRole('button', { name: /Groceries/ })
      .click()
    await expect(page.getByPlaceholder('Search category')).toBeVisible()
  })

  test('categories create menu opens modal', async ({ page }) => {
    await page.goto('/categories')

    await page.getByRole('button', { name: 'New' }).click()
    await page.getByRole('menuitem', { name: 'New Group' }).click()
    const modal = page.locator('[data-slot="modal-dialog"]').filter({ hasText: 'New Group' })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()
  })

  test('recurrings add modal opens, filters, and closes', async ({ page }) => {
    await page.goto('/recurrings')

    await page.getByRole('button', { name: 'Add a recurring' }).click()
    await expect(page.getByRole('heading', { name: 'New recurring' })).toBeVisible()
    await page.getByPlaceholder('Search').fill('Uber')
    await expect(page.getByText('Uber Eats')).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'New recurring' })).toBeHidden()
  })

  test('mobile sidebar opens, navigates, and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await page.getByRole('button', { name: 'Open sidebar' }).click()
    const mobileSidebar = page.locator('aside').filter({ has: page.getByRole('button', { name: 'Close sidebar' }) })
    await expect(mobileSidebar.getByRole('button', { name: 'Close sidebar' })).toBeVisible()
    await mobileSidebar.getByRole('link', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    await expect(mobileSidebar.getByRole('button', { name: 'Close sidebar' })).toBeHidden()
  })
})
