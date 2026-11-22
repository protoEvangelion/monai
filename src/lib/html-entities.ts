/**
 * Minimal HTML entity decoder.
 *
 * Amazon's scraped order data arrives with entities encoded (`Women&#x27;s`),
 * which we store verbatim as a transaction note. Left alone that text is shown
 * to the user *and* fed to the categorizer, where `&#x27;` is pure noise.
 */

const NAMED: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "\u2026",
  lt: "<",
  mdash: "\u2014",
  middot: "\u00b7",
  nbsp: " ",
  ndash: "\u2013",
  quot: '"',
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
};

const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

export function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) return value;

  return value.replace(ENTITY, (match, code: string) => {
    if (code[0] === "#") {
      const isHex = code[1] === "x" || code[1] === "X";
      const digits = isHex ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, isHex ? 16 : 10);
      // Ignore out-of-range or surrogate code points rather than emitting garbage.
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return match;
      if (point >= 0xd800 && point <= 0xdfff) return match;
      try {
        return String.fromCodePoint(point);
      } catch {
        return match;
      }
    }

    return NAMED[code] ?? NAMED[code.toLowerCase()] ?? match;
  });
}

/** Trim, decode, and collapse the whitespace Amazon likes to pad notes with. */
export function normalizeNote(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const decoded = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return decoded.length > 0 ? decoded : null;
}
