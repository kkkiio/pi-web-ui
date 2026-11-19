/**
 * Cache key for highlighted tokens.
 *
 * The cache stores the *tokens of a specific source*, not just styling, so two different
 * code blocks must never share an entry. Keying on `language + length + first/last 100
 * characters` is not enough: successive revisions of one example keep the length and the
 * head/tail while the middle changes, and the second block would render the first one's
 * source.
 *
 * FNV-1a over the whole source keeps the key small without looking at only part of it.
 * Kept in its own module (no JSX) so it can be unit-tested in Node.
 */

export function tokenCacheKey(code: string, language: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < code.length; index++) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${language}:${code.length}:${(hash >>> 0).toString(36)}`;
}
