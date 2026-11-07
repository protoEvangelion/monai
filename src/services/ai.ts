/**
 * Optional single-merchant helper. Batch categorization runs through
 * Vercel AI Gateway (`src/server/aiGateway.ts`) or, when
 * `VITE_ENABLE_BROWSER_AI=1`, Chrome Prompt API in the browser.
 */
export async function categorizeMerchant(
  _merchantName: string,
  _categories: { id: number; name: string }[],
): Promise<number | null> {
  throw new Error(
    "Use the AI Categorize button. Server path is Vercel AI Gateway; Chrome Nano is opt-in via VITE_ENABLE_BROWSER_AI.",
  );
}
