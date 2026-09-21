/** Fuzzy merchant matching for categorization rules. */

export function normalizeRuleText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(
    normalizeRuleText(value)
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

/** True when pattern fuzzy-matches merchant/name (contains, token overlap, or dice ≥ 0.55). */
export function rulePatternMatches(
  pattern: string,
  merchantName: string | null | undefined,
  name?: string | null,
) {
  const needle = normalizeRuleText(pattern);
  if (!needle) return false;
  const haystack = normalizeRuleText(`${merchantName ?? ""} ${name ?? ""}`);
  if (!haystack) return false;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;

  const needleTokens = [...tokenSet(needle)];
  if (needleTokens.length && needleTokens.every((token) => haystack.includes(token))) {
    return true;
  }

  return diceCoefficient(needle, haystack) >= 0.55;
}
