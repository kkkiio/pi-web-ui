/**
 * InlineRun — the inline Markdown subset, per `dil.ebnf` §7.3.
 *
 * Used inside DIL elements (`ElementChild` → `InlineFlow`), where the grammar
 * deliberately has **no** block Markdown: no headings, no lists, no tables, no quotes,
 * no indented code. Text there is one flow of inline atoms, and blank lines are the only
 * block separator.
 *
 *   `code`            → <code>            (raw)
 *   $math$ / \(math\) → <math value>      (mostly produced by parser.ts already)
 *   **bold**          → <bold>
 *   *italic*          → <italic>
 *   ~~strike~~        → <text lineThrough>
 *   [label](url)      → <Link url title>
 *   <https://…>       → <Link>
 *   &amp;             → &                 (character references)
 *   \*                → *                 (backslash escapes)
 *
 * `{expr}` interpolations and inline DIL elements (`<icon>`, `<badge>`, `<Link>`,
 * `<math>`, `<code>`, `<bold>`, `<italic>`) are separate AST nodes: they join the same
 * flow as siblings, which is what keeps `公式 $E = mc^2$ 与…` from losing its spaces.
 *
 * The document level uses the full GFM lexer for blocks and, inside paragraphs,
 * micromark's inline parser — a superset of this grammar. `markdown.test.ts` keeps the
 * two in sync for the shared subset.
 */

import { entityAt } from "./entities.ts";
import { readInlineCodeSpan, readInlineMathSpan } from "./scanner.ts";
import type { DilAttribute, DilElementNode, DilNode } from "./types.ts";

/** Inline DIL tags: they belong to the surrounding InlineRun, not to a block of their own. */
export const INLINE_TAGS: ReadonlySet<string> = new Set(["bold", "italic", "code", "math", "Link", "icon", "badge"]);

const ESCAPABLE = "\\`*_{}[]()#+-.!|$<>~";

export function isInlineTag(name: string): boolean {
  return INLINE_TAGS.has(name);
}

export function parseInline(text: string, pos: number): DilNode[] {
  const nodes: DilNode[] = [];
  let buffer = "";

  const flush = (): void => {
    if (!buffer) return;
    nodes.push({ type: "text", value: buffer, pos });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === "\\" && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === "&") {
      const entity = entityAt(text, i);
      if (entity) {
        buffer += entity.text;
        i = entity.end;
        continue;
      }
    }

    if (char === "`") {
      const span = readInlineCodeSpan(text, i);
      if (span) {
        flush();
        nodes.push(inlineElement("code", [{ type: "text", value: span.value, pos, raw: true }], pos));
        i = span.end;
        continue;
      }
    }

    // Inline math normally arrives as a `<math>` node from the parser; keeping the
    // span here means InlineRun is complete on its own (e.g. hand-built segments).
    if (char === "$" || (char === "\\" && text[i + 1] === "(")) {
      const span = readInlineMathSpan(text, i);
      if (span) {
        flush();
        nodes.push(mathElement(span.value, pos));
        i = span.end;
        continue;
      }
    }

    if (char === "~" && text[i + 1] === "~") {
      const span = readDelimited(text, i, "~~", "nested");
      if (span) {
        flush();
        nodes.push(
          inlineElement("text", parseInline(span.inner, pos + span.innerStart), pos, [booleanAttr("lineThrough", pos)]),
        );
        i = span.end;
        continue;
      }
    }

    if (char === "*") {
      const bold = text[i + 1] === "*";
      const span = readDelimited(text, i, bold ? "**" : "*", bold ? "nested" : "flat");
      if (span) {
        flush();
        const children = bold
          ? parseInline(span.inner, pos + span.innerStart)
          : [{ type: "text", value: span.inner, pos: pos + span.innerStart } satisfies DilNode];
        nodes.push(inlineElement(bold ? "bold" : "italic", children, pos));
        i = span.end;
        continue;
      }
    }

    if (char === "[") {
      const link = readLink(text, i);
      if (link) {
        flush();
        nodes.push(link.node);
        i = link.end;
        continue;
      }
    }

    if (char === "<") {
      const autolink = readAutolink(text, i);
      if (autolink) {
        flush();
        nodes.push(autolink.node);
        i = autolink.end;
        continue;
      }
    }

    buffer += char;
    i++;
  }

  flush();
  return nodes;
}

interface DelimitedSpan {
  readonly inner: string;
  readonly innerStart: number;
  readonly end: number;
}

/**
 * `**…**`, `~~…~~` (nested atoms allowed) and `*…*` (`[^*\n]+`, the grammar's
 * ItalicSpan). The closing delimiter must hug its content on both sides.
 */
function readDelimited(text: string, start: number, delimiter: string, kind: "nested" | "flat"): DelimitedSpan | null {
  const contentStart = start + delimiter.length;
  const first = text[contentStart];
  if (!first || first === "\n" || /\s/.test(first)) return null;

  let k = contentStart;
  while (k < text.length) {
    const found = text.indexOf(delimiter, k);
    if (found < 0) return null;
    const inner = text.slice(contentStart, found);
    const before = text[found - 1] ?? "";
    const flat = kind === "flat" ? inner.includes("\n") || inner.includes("*") : false;
    if (found > contentStart && before && !/\s/.test(before) && !flat) {
      return { inner, innerStart: contentStart, end: found + delimiter.length };
    }
    k = found + delimiter.length;
  }
  return null;
}

function readLink(text: string, start: number): { readonly node: DilElementNode; readonly end: number } | null {
  const labelEnd = findUnescaped(text, "]", start + 1);
  if (labelEnd < 0 || text[labelEnd + 1] !== "(") return null;

  let depth = 1;
  let k = labelEnd + 2;
  while (k < text.length) {
    const char = text[k];
    if (char === "\\") {
      k += 2;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (depth === 0) break;
    k++;
  }
  if (depth !== 0 || k >= text.length) return null;

  const target = splitLinkTarget(text.slice(labelEnd + 2, k));
  if (!target) return null;

  const attrs: DilAttribute[] = [stringAttr("url", target.url, start)];
  if (target.title) attrs.push(stringAttr("title", target.title, start));
  const label = text.slice(start + 1, labelEnd);
  return {
    node: inlineElement("Link", parseInline(label, start + 1), start, attrs),
    end: k + 1,
  };
}

function splitLinkTarget(inside: string): { readonly url: string; readonly title: string | null } | null {
  const match = /^(\S+?)(?:\s+(?:"([\s\S]*)"|'([\s\S]*)'))?$/.exec(inside.trim());
  if (!match) return null;
  return { url: match[1], title: match[2] ?? match[3] ?? null };
}

function readAutolink(text: string, start: number): { readonly node: DilElementNode; readonly end: number } | null {
  const match = /^<((?:https?|mailto):[^<>\s]+)>/.exec(text.slice(start));
  if (!match) return null;
  const url = match[1];
  return {
    node: inlineElement("Link", [{ type: "text", value: url, pos: start }], start, [stringAttr("url", url, start)]),
    end: start + match[0].length,
  };
}

function findUnescaped(text: string, char: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === char) return i;
  }
  return -1;
}

function mathElement(value: string, pos: number): DilElementNode {
  return inlineElement("math", [], pos, [stringAttr("value", value, pos)]);
}

function inlineElement(name: string, children: DilNode[], pos: number, attrs: DilAttribute[] = []): DilElementNode {
  return { type: "element", name, attrs, children, pos, end: pos, closed: true, synthetic: true };
}

function stringAttr(name: string, value: string, pos: number): DilAttribute {
  return { name, kind: "string", value, pos };
}

function booleanAttr(name: string, pos: number): DilAttribute {
  return { name, kind: "boolean", value: true, pos };
}
