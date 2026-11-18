/**
 * Stream Repair — close the inline constructs a streaming tail left open.
 *
 * The parser never sees a half-written document, it sees a *prefix*: a message that
 * ends where the last token landed. `parser.ts` repairs the DIL side of that (unclosed
 * tags, blocks and fences become `closed: false`), but prose is Markdown, and a Markdown
 * prefix such as `**LLM Encoder` is neither an error nor a construct — it is two literal
 * asterisks. Rendering it verbatim is what makes a streaming answer flash `**` for a few
 * frames before the closing `**` arrives.
 *
 * ChatGPT's own stream writes `**LLM Encoder…` (Frame 29) and `    **CL` (Frame 126) into
 * `data/streams` and compiles them to `<bold>` immediately, i.e. it repairs the tail
 * before parsing. This module is that repair, restricted to the case the grammar can
 * actually decide: **the last paragraph of the document**.
 *
 *   **LLM Encoder      → **LLM Encoder**      → <bold>LLM Encoder</bold>
 *   `192.168.1.1      → `192.168.1.1`         → <code>192.168.1.1</code>
 *   ~~删除             → ~~删除~~              → <text lineThrough>删除</text>
 *   [文档](https://…  → 文档                  → 文档 (the unfinished target is dropped)
 *
 * What is deliberately left alone:
 *
 *   a * b              a lone `*` between spaces is a multiplication sign, not emphasis
 *   ```js              a fence is a block, `parser.ts` closes it with `closed: false`
 *   `a[b](c            inside a code span, so only the backtick is closed
 *   earlier paragraphs  only the tail is active; a finished paragraph keeps its bytes
 *
 * The repair is a *text* transform, applied in `markdown.ts` right before the prose is
 * lexed, so both prose tiers (`dil.ebnf` §1/§7) share exactly one implementation.
 */

import { readInlineCodeSpan, readInlineMathSpan } from "./scanner.ts";

/**
 * Emphases repaired at the tail. `***` first: it is bold+italic, and matching `**`
 * inside it would leave one stray asterisk behind. `_` is absent on purpose —
 * `InlineRun` has no underscore emphasis, and repairing it would only trade a bare
 * underscore for two.
 */
const MARKERS = ["***", "**", "*", "~~"] as const;

/** Characters that can follow an opener or precede a closer. */
const SPACE = /\s/;

/**
 * Repair the tail of one prose fragment. The caller decides *whether* a fragment is at
 * the streaming tail (see `markdown.ts`); this function only repairs what it is given.
 */
export function repairStreamTail(text: string): string {
  if (!text) return text;

  const { head, body, trailing } = splitTail(text);
  if (!body) return text;

  // Everything after an unmatched backtick is code content, so a `[` behind it is not a
  // link: only the backtick gets closed there.
  const openCode = openCodeRun(body);

  // Links first: dropping an unfinished `(target` removes markers that would otherwise
  // be counted as open (`[a](http://x*y`), and the label is what a reader keeps.
  const repaired = closePendingMarkers(repairIncompleteLink(body, openCode?.index ?? -1), openCode);
  return head + repaired + trailing;
}

// ---------------------------------------------------------------------------
// Fragment split — only the last paragraph is active
// ---------------------------------------------------------------------------

interface Tail {
  /** Everything before the last paragraph, byte for byte. */
  readonly head: string;
  /** The last paragraph, without its trailing layout whitespace. */
  readonly body: string;
  /** Trailing spaces/tabs/newlines, re-appended after the repair. */
  readonly trailing: string;
}

/** Blank lines end a paragraph, both tiers (`dil.ebnf` §7.2). */
const BLANK_LINE = /\n[ \t]*\n/g;

function splitTail(text: string): Tail {
  let start = 0;
  for (let match = BLANK_LINE.exec(text); match; match = BLANK_LINE.exec(text)) start = match.index + match[0].length;
  BLANK_LINE.lastIndex = 0;

  const paragraph = text.slice(start);
  const body = paragraph.replace(/[ \t\r\n]+$/, "");
  return { head: text.slice(0, start), body, trailing: paragraph.slice(body.length) };
}

// ---------------------------------------------------------------------------
// Inline code spans and math spans are opaque
// ---------------------------------------------------------------------------

function runLength(text: string, start: number, char: string): number {
  let run = 1;
  while (text[start + run] === char) run++;
  return run;
}

/**
 * Same-length copy of `text` with every closed code/math span blanked out, so link and
 * emphasis detection never looks inside one. Indices stay valid for the original.
 */
function maskProtected(text: string): string {
  const chars = text.split("");
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < chars.length; i++) chars[i] = "x";
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === "`") {
      const run = runLength(text, i, "`");
      if (run >= 3) {
        // A fence, not an inline span: nothing behind it belongs to this paragraph.
        i += run;
        continue;
      }
      const span = readInlineCodeSpan(text, i);
      if (span) {
        blank(i, span.end);
        i = span.end;
        continue;
      }
      i += run;
      continue;
    }
    if (char === "$" || (char === "\\" && text[i + 1] === "(")) {
      const span = readInlineMathSpan(text, i);
      if (span) {
        blank(i, span.end);
        i = span.end;
        continue;
      }
    }
    i++;
  }
  return chars.join("");
}

// ---------------------------------------------------------------------------
// Links — keep the label, drop the unfinished target
// ---------------------------------------------------------------------------

/**
 * `[label](https://example.com` → `label`.
 *
 * A half-received destination is not worth a node: it would render as a link to a URL
 * that does not exist yet, and as raw `(https://…` before that. ChatGPT's transcript
 * keeps the label visible and lets the target appear when it is complete. Images are
 * skipped — `![alt](src` is literal Markdown in Phase 1.
 */
function repairIncompleteLink(text: string, codeStart = -1): string {
  const masked = maskProtected(text);
  const last = lastIncompleteLink(masked, codeStart);
  if (!last) return text;
  return text.slice(0, last.open) + text.slice(last.open + 1, last.labelEnd);
}

interface IncompleteLink {
  /** Index of `[`. */
  readonly open: number;
  /** Index of the matching `]`. */
  readonly labelEnd: number;
}

function lastIncompleteLink(masked: string, codeStart = -1): IncompleteLink | null {
  let found: IncompleteLink | null = null;
  let i = 0;
  while (i < masked.length) {
    if (masked[i] === "\\") {
      i += 2;
      continue;
    }
    if (masked[i] !== "[" || masked[i - 1] === "!" || (codeStart >= 0 && i > codeStart)) {
      i++;
      continue;
    }
    const labelEnd = masked.indexOf("]", i + 1);
    if (labelEnd < 0 || masked[labelEnd + 1] !== "(") {
      i++;
      continue;
    }
    // A `)` anywhere after the `(` means the link is complete (or at least closed).
    if (masked.indexOf(")", labelEnd + 2) >= 0) {
      i = labelEnd + 1;
      continue;
    }
    found = { open: i, labelEnd };
    i = labelEnd + 1;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Emphasis and inline code — balance the openers at the end
// ---------------------------------------------------------------------------

function closePendingMarkers(text: string, openCode: OpenCodeRun | null = openCodeRun(text)): string {
  if (openCode === null) return text + pendingClosers(text);

  // Everything after an unmatched backtick run is code content, so only the part before
  // it can still hold emphasis; the backtick closer has to come first.
  const before = text.slice(0, openCode.index);
  return `${text}${"`".repeat(openCode.run)}${pendingClosers(before)}`;
}

interface OpenCodeRun {
  readonly index: number;
  readonly run: number;
}

function openCodeRun(text: string): OpenCodeRun | null {
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    const run = runLength(text, i, "`");
    if (run >= 3) {
      i += run;
      continue;
    }
    const span = readInlineCodeSpan(text, i);
    if (span) {
      i = span.end;
      continue;
    }
    return { index: i, run };
  }
  return null;
}

/** Closers for every marker still open at the end, innermost first. */
function pendingClosers(text: string): string {
  const masked = maskProtected(text);
  const pending: string[] = [];

  let i = 0;
  while (i < masked.length) {
    if (masked[i] === "\\") {
      i += 2;
      continue;
    }
    const marker = markerAt(masked, i);
    if (!marker) {
      i++;
      continue;
    }
    const contentStart = i + marker.length;
    if (!isOpener(masked, contentStart)) {
      i = contentStart;
      continue;
    }
    const close = findCloser(masked, contentStart, marker);
    if (close < 0) {
      pending.push(marker);
      i = contentStart;
      continue;
    }
    i = close + marker.length;
  }

  return pending.reverse().join("");
}

function markerAt(text: string, i: number): string | null {
  for (const marker of MARKERS) if (text.startsWith(marker, i)) return marker;
  return null;
}

/** Left-flanking: an opener has to hug a non-space character. `a * b` stays literal. */
function isOpener(text: string, contentStart: number): boolean {
  const next = text[contentStart];
  return next !== undefined && !SPACE.test(next);
}

function findCloser(text: string, from: number, marker: string): number {
  const last = text.length - marker.length;
  for (let k = from; k <= last; k++) {
    if (text[k] === "\\") {
      k++;
      continue;
    }
    if (!text.startsWith(marker, k)) continue;
    // Right-flanking: the closer has to hug the content it closes.
    if (k === 0 || SPACE.test(text[k - 1])) continue;
    // A longer run belongs to a longer marker: `***` is not `*` then `**`.
    if (marker.length === 1 && text[k + 1] === marker) continue;
    if (marker === "~~" && text[k + 2] === "~") continue;
    return k;
  }
  return -1;
}
