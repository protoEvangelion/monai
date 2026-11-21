import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const SOURCE = readFileSync(
  path.resolve(process.cwd(), 'scripts/amazon-bookmarklet.js'),
  'utf8',
)

const PAYMENTS_TABLE = `<title>Transactions</title><table>
  <tr>
    <td><a href="/gp/css/order-details?orderID=111-2223334-5556667">Order #111-2223334-5556667</a></td>
    <td>Nov 12, 2026</td><td>$42.50</td>
  </tr>
  <tr>
    <td><a href="/gp/css/order-details?orderID=222-3334445-6667778">Order #222-3334445-6667778</a></td>
    <td>Nov 10, 2026</td><td>$15.99</td>
  </tr>
</table>`

/**
 * Serves a stand-in Amazon page at the app's own origin.
 *
 * It has to be a real document, not `setContent`: the app hydrates, and React
 * regenerating the tree wipes any injected markup.
 */
async function openAmazonShell(page: Page, frameSrc: string) {
  await page.route('**/fixture/shell.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<title>Your Payments</title><h1>Your Payments</h1><iframe src="${frameSrc}"></iframe>`,
    }),
  )
  await page.goto('/fixture/shell.html')
  // Keep the handoff local; the bookmarklet defaults to the deployed origin.
  await page.evaluate(() => localStorage.setItem('monaiImportOrigin', location.origin))
}

async function injectBookmarklet(page: Page) {
  await page.evaluate((source) => {
    const script = document.createElement('script')
    script.textContent = source
    document.body.appendChild(script)
  }, SOURCE)
}

function badgeText(page: Page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div')].filter((node) =>
      (node.textContent ?? '').startsWith('Monai:'),
    )
    return nodes.length ? (nodes[nodes.length - 1] as HTMLElement).innerText : ''
  })
}

test.describe('amazon bookmarklet', () => {
  test('reads a payments table that lives in a same-origin frame', async ({ page }) => {
    await page.route('**/fixture/payments.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: PAYMENTS_TABLE }),
    )
    await openAmazonShell(page, '/fixture/payments.html')
    await injectBookmarklet(page)

    await expect(page).toHaveURL(/amazon-import#/, { timeout: 20_000 })
  })

  test('hands over the frame URL when the table is behind a cross-origin frame', async ({
    page,
  }) => {
    await page.route('https://payments.example.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: PAYMENTS_TABLE }),
    )
    await openAmazonShell(page, 'https://payments.example.test/yourpayments/transactions')
    await injectBookmarklet(page)

    const link = page.getByRole('link', { name: 'Open payment frame →' })
    await expect(link).toBeVisible({ timeout: 20_000 })
    await expect(link).toHaveAttribute('href', /payments\.example\.test/)
    // A frame it cannot read is not the same as being signed out.
    await expect(page.locator('body')).not.toContainText('no payments found')
  })

  test('reports what it saw when no frame looks like the payments table', async ({ page }) => {
    await page.route('https://widgets.example.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>widget</p>' }),
    )
    await openAmazonShell(page, 'https://widgets.example.test/embed')
    await injectBookmarklet(page)

    await expect.poll(() => badgeText(page), { timeout: 30_000 }).toContain('orderID links: 0')
  })
})
