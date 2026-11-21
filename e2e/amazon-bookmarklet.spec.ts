import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// The page bakes its own origin into the string; do the same here. The sink
// swallows the handoff so a test can read the payload out of the URL instead of
// navigating into the app (which strips the fragment on hydration).
const SINK = 'http://localhost:3000/fixture'
const SOURCE = readFileSync(
  path.resolve(process.cwd(), 'scripts/amazon-bookmarklet.js'),
  'utf8',
).replace('"@@MONAI_ORIGIN@@"', JSON.stringify(SINK))

async function routeSink(page: Page) {
  await page.route('**/fixture/amazon-import*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>sink</title>' }),
  )
}

async function readPayload(page: Page) {
  await expect(page).toHaveURL(/fixture\/amazon-import#/, { timeout: 30_000 })
  const encoded = page.url().split('#')[1] ?? ''
  const json = Buffer.from(
    encoded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8')
  return JSON.parse(json) as {
    kind: string
    source?: string
    payments: { order_id: string; amount_cents: number; payment_date: string | null }[]
    orders: { order_id: string; suggestedNote: string | null }[]
  }
}

const NEXT_DATA_PAGE = `<!doctype html><html><head><title>Your Payments</title></head><body>
<h1>Your Payments</h1>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      state: {
        transactionResponseState: {
          hasMore: false,
          visibleTransactionResponse: {
            transactionList: [
              {
                formattedAmount: '-$5.33',
                formattedDate: 'Nov 20, 2026',
                orderData: [
                  {
                    orderDisplayString: 'Order #D01-1935820-8646614',
                    orderDetailsUrl:
                      'https://www.amazon.com/gp/css/order-details?orderID=D01-1935820-8646614',
                  },
                ],
                statementDescriptor: 'Ad free for PrimeVideo',
                paymentMethodDisplayStringData: {
                  paymentMethodName: 'Prime Visa',
                  paymentMethodNumber: { lastDigits: '9835' },
                },
              },
              {
                formattedAmount: '-$212.87',
                formattedDate: 'Nov 18, 2026',
                orderData: [
                  {
                    orderDisplayString: 'Order #112-8969633-0735464',
                    orderDetailsUrl:
                      'https://www.amazon.com/gp/css/summary/edit.html?orderID=112-8969633-0735464',
                  },
                ],
                statementDescriptor: 'AMZN Mktp US',
              },
            ],
          },
        },
      },
    },
  },
})}</script></body></html>`

const ORDER_PAGE = `<html><body>Order placed November 20, 2026
<a href="/gp/product/x?ppx_hzod_title_dt_b_fed_asin_title=1">Test Item</a></body></html>`

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
async function openAmazonShell(page: Page, bodyHtml: string) {
  await page.route('**/fixture/shell.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<title>Your Payments</title><h1>Your Payments</h1>${bodyHtml}`,
    }),
  )
  await page.goto('/fixture/shell.html')
}

async function injectBookmarklet(page: Page) {
  await page.evaluate((source) => {
    const script = document.createElement('script')
    script.textContent = source
    document.body.appendChild(script)
  }, SOURCE)
}

test.describe('amazon bookmarklet', () => {
  test('reads a payments table that lives in a same-origin frame', async ({ page }) => {
    await routeSink(page)
    await page.route('**/fixture/payments.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: PAYMENTS_TABLE }),
    )
    await openAmazonShell(page, '<iframe src="/fixture/payments.html"></iframe>')
    await injectBookmarklet(page)

    const payload = await readPayload(page)
    expect(payload.payments).toHaveLength(2)
    expect(payload.payments[0].amount_cents).toBe(4250)
  })

  test('hands over the frame URL when the table is behind a cross-origin frame', async ({
    page,
  }) => {
    await page.route('https://payments.example.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: PAYMENTS_TABLE }),
    )
    await openAmazonShell(
      page,
      '<iframe src="https://payments.example.test/yourpayments/transactions"></iframe>',
    )
    await injectBookmarklet(page)

    const link = page.getByRole('link', { name: 'Open payment frame →' })
    await expect(link).toBeVisible({ timeout: 20_000 })
    await expect(link).toHaveAttribute('href', /payments\.example\.test/)
    // A frame it cannot read is not the same as being signed out.
    await expect(page.locator('body')).not.toContainText('no payments found')
  })

  test('reads transactions from the page state, not the markup', async ({ page }) => {
    await routeSink(page)
    await page.route('**/gp/css/order-details**', (route) =>
      route.fulfill({ contentType: 'text/html', body: ORDER_PAGE }),
    )
    await page.route('**/gp/css/summary**', (route) =>
      route.fulfill({ contentType: 'text/html', body: ORDER_PAGE }),
    )
    await page.route('**/fixture/state.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: NEXT_DATA_PAGE }),
    )

    await page.goto('/fixture/state.html')
    await injectBookmarklet(page)

    const payload = await readPayload(page)
    expect(payload.kind).toBe('scrape')
    expect(payload.source).toBe('next-data')
    expect(payload.payments).toHaveLength(2)

    // Amazon renders a charge as "-$5.33"; Monai stores it as +533.
    expect(payload.payments[0]).toMatchObject({
      order_id: 'D01-1935820-8646614',
      amount_cents: 533,
      payment_date: 'Nov 20, 2026',
    })
    expect(payload.orders[0]?.suggestedNote).toBe('Amazon: Test Item (ordered Nov 20)')
  })

  test('follows pagination and merges the extra pages', async ({ page }) => {
    await routeSink(page)
    await page.route('**/gp/css/order-details**', (route) =>
      route.fulfill({ contentType: 'text/html', body: ORDER_PAGE }),
    )
    await page.route('**/fixture/api/page2', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            transactionList: [
              {
                formattedAmount: '-$30.00',
                formattedDate: 'Oct 15, 2026',
                orderData: [
                  {
                    orderDetailsUrl:
                      'https://www.amazon.com/gp/css/order-details?orderID=999-0000001-0000002',
                  },
                ],
                statementDescriptor: 'AMZN Mktp US',
              },
              {
                formattedAmount: '-$44.44',
                formattedDate: 'Oct 2, 2026',
                orderData: [
                  {
                    orderDetailsUrl:
                      'https://www.amazon.com/gp/css/order-details?orderID=999-0000003-0000004',
                  },
                ],
                statementDescriptor: 'Amazon.com',
              },
            ],
          },
        }),
      }),
    )

    // One transaction on the page, hasMore, and a control that fetches a page.
    const pageHtml = NEXT_DATA_PAGE.replace('"hasMore":false', '"hasMore":true').replace(
      '</body>',
      `<button aria-label="Next Page">Next Page</button>
       <script>
         let clicks = 0
         document.querySelector('button').addEventListener('click', async () => {
           clicks += 1
           if (clicks > 1) return
           await fetch('/fixture/api/page2').then((response) => response.json())
         })
       </script></body>`,
    )
    await page.route('**/fixture/paged.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: pageHtml }),
    )

    await page.goto('/fixture/paged.html')
    await injectBookmarklet(page)

    const payload = await readPayload(page)
    // 2 from the page, 2 captured from the follow-up request.
    expect(payload.payments).toHaveLength(4)
    expect(payload.payments.map((payment) => payment.amount_cents)).toEqual([
      533, 21287, 3000, 4444,
    ])
  })

  test('reports what it saw when no frame looks like the payments table', async ({ page }) => {
    await page.route('https://widgets.example.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>widget</p>' }),
    )
    await openAmazonShell(
      page,
      '<iframe src="https://widgets.example.test/embed"></iframe><iframe src="https://widgets.example.test/embed2"></iframe>',
    )
    await injectBookmarklet(page)

    // Nothing readable: it hands the diagnostics back instead of guessing.
    const payload = await readPayload(page)
    expect(payload.kind).toBe('diagnostics')
  })
})
