/**
 * Optional single-merchant helper. Prefer browser Prompt API via
 * `lib/browserAiCategorize.ts` for batch categorization in the UI.
 */
export async function categorizeMerchant(
  _merchantName: string,
  _categories: { id: number; name: string }[],
): Promise<number | null> {
  throw new Error(
    "Server-side Cursor categorization was removed. Use Chrome built-in AI in the browser.",
  );
}
