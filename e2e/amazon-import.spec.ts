import { expect, test } from '@playwright/test'

const PAYLOAD = {
  scrapedAt: new Date().toISOString(),
  payments: [{ order_id: '123-4567890-1234567', amount_cents: 4250, payment_date: 'January 1, 2026' }],
  orders: [
    {
      order_id: '123-4567890-1234567',
      order_date: 'January 1, 2026',
      suggestedNote: 'Amazon: test gadget (ordered Jan 1)',
    },
  ],
}

function toBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

test.describe('amazon import', () => {
  test('shows setup instructions with a working bookmarklet', async ({ page }) => {
    await page.goto('/amazon-import')

    await expect(page.getByText('One-click setup')).toBeVisible()

    // React 19 replaces a javascript: href with a thrower, so the link is set
    // through the DOM. If that regresses, this attribute becomes that thrower.
    const href = await page.getByRole('link', { name: /Monai → Amazon/ }).getAttribute('href')
    expect(href).toMatch(/^javascript:/)
    expect(href).not.toContain('React has blocked')

    const source = decodeURIComponent(href!.slice('javascript:'.length))
    expect(source).toContain('cpe/yourpayments/transactions')
    expect(source).toContain('/amazon-import#')
  })

  test('runs the import from a payload in the URL fragment', async ({ page }) => {
    await page.goto(`/amazon-import#${toBase64Url(PAYLOAD)}`)

    // The fragment is consumed and stripped so a refresh cannot replay it.
    await expect(page.getByRole('heading', { name: 'Amazon import' })).toBeVisible()
    await expect(page.getByText('Missing notes')).toBeVisible()
    await expect(page.getByText('Matched')).toBeVisible()
    await expect(page).not.toHaveURL(/#/)
  })

  test('reports a malformed payload instead of crashing', async ({ page }) => {
    await page.goto('/amazon-import#not-valid-base64!!')
    await expect(page.getByText(/did not contain a readable scrape payload/i)).toBeVisible()
  })
})
