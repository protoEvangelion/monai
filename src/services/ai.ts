/**
 * Optional single-merchant helper. Batch categorization runs through
 * Vercel AI Gateway (`src/server/aiGateway.ts`).
 */
export async function categorizeMerchant(
  _merchantName: string,
  _categories: { id: number; name: string }[],
): Promise<number | null> {
  throw new Error("Use the AI Categorize button. Categorization runs through Vercel AI Gateway.");
}
