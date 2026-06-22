import { runCodexCategorizerCli } from "./codexCli";

function parseCategoryId(raw: string) {
  const match = raw.match(/\b\d+\b/);
  return match ? Number(match[0]) : null;
}

async function runCodexCategorizer(prompt: string) {
  return runCodexCategorizerCli({
    maxBuffer: 1024 * 1024,
    prompt,
    schema: {
      type: "object",
      properties: {
        categoryId: { type: "number" },
      },
      required: ["categoryId"],
      additionalProperties: false,
    },
    tempPrefix: "monai-codex-merchant-",
  });
}

export async function categorizeMerchant(
  merchantName: string,
  categories: { id: number; name: string }[],
) {
  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");
  const prompt = [
    "Classify the merchant into exactly one category from the list.",
    'Return only JSON in the shape {"categoryId":123}. Do not include markdown or explanation.',
    "",
    categoryList,
    "",
    `Merchant: ${merchantName}`,
  ].join("\n");

  return parseCategoryId(await runCodexCategorizer(prompt));
}
