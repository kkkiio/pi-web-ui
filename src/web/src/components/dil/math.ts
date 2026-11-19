/**
 * KaTeX for `<math>` (`#49`).
 *
 * A math node carries LaTeX in `value`; `block` switches display mode. The output is a string
 * rather than a React tree, so it can be unit-tested in Node and memoised on `(value, block)`.
 *
 * `trust: false` is KaTeX's default and stays explicit: `\href` / `\url` and raw HTML commands
 * are refused, so a model cannot smuggle a link or markup into the transcript through math.
 */

import katex from "katex";

export function mathHtml(value: string, block: boolean): string | null {
  if (!value.trim()) return null;
  try {
    return katex.renderToString(value, {
      displayMode: block,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return null;
  }
}
