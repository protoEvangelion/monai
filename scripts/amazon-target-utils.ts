export type AmazonWorklistTx = {
  id: number;
  date: number;
  amount: number;
  merchant_name: string;
  name: string | null;
  category_id: number | null;
};

/** Suffix after `*` in descriptors like `AMAZON MKTPL*3H14L0NA3`. */
export function amazonMarketplaceToken(target: string) {
  const trimmed = target.trim();
  const starMatch = trimmed.match(/\*([A-Z0-9]+)$/i);
  if (starMatch) return starMatch[1]!.toUpperCase();
  if (/^[A-Z0-9]{6,12}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export function parseAmazonTargets(raw: string | undefined): "all" | string[] {
  if (!raw || raw.trim().toLowerCase() === "all") return "all";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function txMatchesAmazonTarget(tx: AmazonWorklistTx, target: string) {
  const trimmed = target.trim();
  if (/^\d+$/.test(trimmed)) return tx.id === Number(trimmed);

  const upperTarget = trimmed.toUpperCase();
  const haystack = `${tx.merchant_name} ${tx.name ?? ""}`.toUpperCase();
  if (haystack.includes(upperTarget)) return true;

  const token = amazonMarketplaceToken(trimmed);
  if (!token) return false;
  return haystack.includes(token) || haystack.includes(`*${token}`);
}

export function filterWorklistByTargets(worklist: AmazonWorklistTx[], targets: "all" | string[]) {
  if (targets === "all") return worklist;
  return worklist.filter((tx) => targets.some((target) => txMatchesAmazonTarget(tx, target)));
}
