import { expect, test } from '@playwright/test'

test.describe('assistant panel', () => {
  test('opens from the header and switches between Chat and Runs', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Open assistant' }).click()

    const panel = page.getByRole('dialog')
    await expect(panel.getByRole('heading', { name: 'Assistant' })).toBeVisible()

    // Chat is the default section and offers starter questions.
    await expect(panel.getByRole('radio', { name: 'Chat' })).toBeChecked()
    await expect(
      panel.getByRole('button', { name: /What did I spend the most on/ }),
    ).toBeVisible()
    await expect(
      panel.getByPlaceholder('Ask about your spending, or type / for skills…'),
    ).toBeVisible()

    // Runs starts empty in a fresh browser context.
    await panel.getByRole('radio', { name: 'Runs' }).click()
    await expect(panel.getByText('Nothing has run yet')).toBeVisible()

    // Closing returns focus to the page, not a stuck overlay.
    await panel.getByRole('button', { name: 'Close assistant' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('slash opens the skill menu and inserts the skill card', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open assistant' }).click()

    const panel = page.getByRole('dialog')
    const composer = panel.getByPlaceholder(
      'Ask about your spending, or type / for skills…',
    )

    await composer.fill('/')
    await composer.press('Enter')

    // The card asks for the scrape payload inline instead of sending a prompt.
    await expect(panel.getByText('/categorize-amazon-transactions')).toBeVisible()
    await expect(panel.getByText('Scrape JSON')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Match & add notes' })).toBeDisabled()
  })
})
