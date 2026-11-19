/**
 * Character references.
 *
 * DIL source is JSX-like, so models sometimes escape text as HTML (`Usage &amp;
 * Billing`). The structural parser leaves prose entities as written and the Markdown
 * layer decodes them — decoding in both places would decode twice — so the decoder is
 * shared: `parser.ts` uses it for raw text (`<code>`, `<code-block>`), `inline.ts` for
 * element-interior prose.
 */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  "#39": "'",
};

const REFERENCE_SOURCE = "&(amp|lt|gt|quot|apos|nbsp|#39|#\\d{1,7}|#x[0-9a-fA-F]{1,6});";
const REFERENCE_ALL = new RegExp(REFERENCE_SOURCE, "g");
const REFERENCE_AT = new RegExp(REFERENCE_SOURCE, "y");

export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(REFERENCE_ALL, (match, key: string) => {
    const named = NAMED[key];
    if (named !== undefined) return named;
    const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** One reference at `index`, or null — used by the InlineRun scanner. */
export function entityAt(value: string, index: number): { readonly text: string; readonly end: number } | null {
  REFERENCE_AT.lastIndex = index;
  const match = REFERENCE_AT.exec(value);
  return match ? { text: decodeEntities(match[0]), end: index + match[0].length } : null;
}
