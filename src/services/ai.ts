const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH ?? "copilot";
const COPILOT_MODEL = process.env.COPILOT_CATEGORIZER_MODEL ?? "gpt-5.4-mini";

function parseCategoryId(raw: string) {
  const match = raw.match(/\b\d+\b/);
  return match ? Number(match[0]) : null;
}

export async function categorizeMerchant(
  merchantName: string,
  categories: { id: number; name: string }[],
) {
  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");
  const prompt = [
    "Classify the merchant into exactly one category from the list.",
    "Return only the numeric category ID. Do not include markdown or explanation.",
    "",
    categoryList,
    "",
    `Merchant: ${merchantName}`,
  ].join("\n");

  const [{ execFile }, { promisify }] = await Promise.all([
    import("node:child_process"),
    import("node:util"),
  ]);
  const execFileAsync = promisify(execFile);
  const { stdout, stderr } = await execFileAsync(
    COPILOT_CLI_PATH,
    [
      "--model",
      COPILOT_MODEL,
      "-p",
      prompt,
      "--silent",
      "--no-color",
      "--stream",
      "off",
      "--allow-all-tools",
      "--disable-builtin-mcps",
      "--deny-tool=shell",
      "--deny-tool=read",
      "--deny-tool=write",
      "--no-custom-instructions",
      "--no-ask-user",
    ],
    {
      timeout: Number(process.env.COPILOT_CATEGORIZER_TIMEOUT_MS ?? 90_000),
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    },
  );

  return parseCategoryId(`${stdout}\n${stderr}`);
}
