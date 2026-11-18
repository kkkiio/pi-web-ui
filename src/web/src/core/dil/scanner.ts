/**
 * Low-level scanners shared by the parser and the `{@body}` statement splitter.
 *
 * None of these know anything about DIL. They only understand enough JavaScript
 * lexing — strings, template literals, comments, regex literals — to find a balanced
 * bracket or a top-level separator without being fooled by a `}` inside a string.
 */

export interface BalancedSpan {
  /** Text between the delimiters; runs to EOF when `ok` is false. */
  readonly inner: string;
  /** Offset just past the closing delimiter (or `src.length`). */
  readonly end: number;
  /** False when the region never closed — the caller turns that into a diagnostic. */
  readonly ok: boolean;
}

type ScanFrame =
  | { readonly type: "str"; readonly quote: string }
  | { readonly type: "tmpl" }
  | { readonly type: "brace"; readonly depthAtOpen: number };

const REGEX_PRECEDERS = "([{,;:=!&|?+-*%~^<>";

/**
 * Scan a balanced `open … close` region starting at `start` (`src[start] === open`).
 * Nested braces, string/template literals, regex literals and comments are skipped, so
 * `"}"` or `` `}` `` never closes a value early. Never throws: an unterminated region
 * runs to the end of the source with `ok: false`.
 */
export function readBalanced(src: string, start: number, open = "{", close = "}"): BalancedSpan {
  let i = start;
  let depth = 0;
  const stack: ScanFrame[] = [];
  let prevSignificant = "";

  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];

    if (top && top.type === "str") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === top.quote) stack.pop();
      i++;
      continue;
    }
    if (top && top.type === "tmpl") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop();
        i++;
        continue;
      }
      // `${` opens an expression inside the template; remember the depth so its
      // closing `}` can be told apart from object literals inside it.
      if (c === "$" && src[i + 1] === "{") {
        stack.push({ type: "brace", depthAtOpen: depth });
        depth++;
        i += 2;
        prevSignificant = "{";
        continue;
      }
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      stack.push({ type: "str", quote: c });
      i++;
      prevSignificant = c;
      continue;
    }
    if (c === "`") {
      stack.push({ type: "tmpl" });
      i++;
      prevSignificant = c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "/" && (prevSignificant === "" || REGEX_PRECEDERS.includes(prevSignificant))) {
      i = skipRegex(src, i + 1);
      continue;
    }

    if (c === open) {
      depth++;
      i++;
      prevSignificant = c;
      continue;
    }
    if (c === close) {
      depth--;
      i++;
      if (top && top.type === "brace" && depth === top.depthAtOpen) {
        stack.pop(); // closed a `${…}`: back to template-literal mode
        prevSignificant = close;
        continue;
      }
      if (depth === 0) return { inner: src.slice(start + 1, i - 1), end: i, ok: true };
      prevSignificant = c;
      continue;
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }

  return { inner: src.slice(start + 1), end: src.length, ok: false };
}

/** Offset just past a `/regex/flags` literal starting at the opening slash. */
function skipRegex(src: string, i: number): number {
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return i;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i + 1;
    i++;
  }
  return i;
}

/**
 * Index of the first `match(expr, i)` at bracket/string depth 0, or -1. The predicate
 * form lets callers look for multi-character separators (` as `).
 */
export function findTopLevel(expr: string, match: (source: string, index: number) => boolean, from = 0): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && match(expr, i)) return i;
  }
  return -1;
}

/** Index of a single character at depth 0, or -1. */
export function topLevelIndex(expr: string, ch: string, from = 0): number {
  return findTopLevel(expr, (source, i) => source[i] === ch, from);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export interface InlineSpan {
  readonly value: string;
  /** Offset just past the closing delimiter. */
  readonly end: number;
  readonly syntax: "code" | "math";
}

/**
 * `` `code` `` (any delimiter run length, no newline inside). Shared with the parser so
 * a directive written *inside* inline code — `` `{#each …}` `` in prose — stays text.
 */
export function readInlineCodeSpan(text: string, start: number): InlineSpan | null {
  if (text[start] !== "`") return null;
  let run = 1;
  while (text[start + run] === "`") run++;
  const fence = "`".repeat(run);

  let k = start + run;
  while (k < text.length) {
    const found = text.indexOf(fence, k);
    if (found < 0) return null;
    if (text[found + run] === "`") {
      k = found + run;
      continue;
    }
    const value = text.slice(start + run, found);
    if (!value || value.includes("\n")) return null;
    return { value, end: found + run, syntax: "code" };
  }
  return null;
}

/**
 * Inline math: `\(…\)` always, `$…$` only when it cannot plausibly be prose. Prose is
 * full of currency (`$20 per message … $`), and mis-reading it as LaTeX is worse than
 * missing a formula.
 */
export function readInlineMathSpan(text: string, start: number): InlineSpan | null {
  if (text[start] === "\\" && text[start + 1] === "(") {
    const end = text.indexOf("\\)", start + 2);
    if (end < 0) return null;
    const value = text.slice(start + 2, end).trim();
    return value ? { value, end: end + 2, syntax: "math" } : null;
  }
  if (text[start] !== "$" || text[start + 1] === "$") return null;

  const end = text.indexOf("$", start + 1);
  if (end < 0) return null;
  const inner = text.slice(start + 1, end);
  if (!inner || inner.includes("\n") || /^\s|\s$/.test(inner)) return null;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(inner)) return null;
  if (inner.includes("**") || inner.includes("`")) return null;
  if (/^[\d.,]+$/.test(inner)) return null;
  if (/^\d/.test(inner) && !/[\\^_=+*/{}<>]/.test(inner)) return null;
  return { value: inner, end: end + 1, syntax: "math" };
}

export interface EachClause {
  readonly list: string;
  /** Raw loop pattern, e.g. `item` or `item, i`. */
  readonly pattern: string;
  readonly item: string;
  readonly index: string | null;
}

/**
 * `{#each list as item}` → `{ list, item }`, split at the top-level ` as ` so
 * `{ a: " as b" } as y` keeps the string intact. Returns null when the clause has no
 * top-level ` as `.
 */
export function splitEachClause(expr: string): EachClause | null {
  const at = findTopLevel(expr, (source, i) => source.startsWith(" as ", i));
  if (at < 0) return null;
  const list = expr.slice(0, at).trim();
  const pattern = expr.slice(at + 4).trim();
  const parts = pattern.split(",").map((part) => part.trim());
  const item = parts[0] || "item";
  const index = parts[1] || null;
  return {
    list: list || "[]",
    pattern,
    item: IDENTIFIER.test(item) ? item : "item",
    index: index && IDENTIFIER.test(index) ? index : null,
  };
}

/** UTF-16 offset → 1-based line/column, in one pass at construction time. */
export class LineIndex {
  private readonly starts: number[] = [0];
  private readonly length: number;

  constructor(src: string) {
    this.length = src.length;
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "\n") this.starts.push(i + 1);
    }
  }

  lineCol(index: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(index, this.length));
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid] <= clamped) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: clamped - this.starts[low] + 1 };
  }
}
