import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": "https://monai.local", // Optional, for OpenRouter rankings
    "X-Title": "Monai", // Optional, for OpenRouter rankings
  }
});

export async function categorizeMerchant(merchantName: string, categories: { id: number, name: string }[]) {
  const categoryList = categories.map(c => `${c.id}: ${c.name}`).join("\n");
  
  const prompt = `
    Classify the following merchant into one of these categories:
    ${categoryList}

    Merchant: ${merchantName}

    Return only the category ID.
  `;

  const response = await openai.chat.completions.create({
    model: "google/gemma-7b-it:free",
    messages: [
      { role: "system", content: "You are a financial assistant that categorizes transactions." },
      { role: "user", content: prompt }
    ],
  });

  const result = response.choices[0].message.content?.trim();
  return result ? parseInt(result) : null;
}
