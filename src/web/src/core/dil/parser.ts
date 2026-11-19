/**
 * DIL structural parser: source → AST, with recovery diagnostics.
 *
 *   markdown prose          → { type: "text" }       (lowered later by markdown.ts)
 *   {@body stmt}            → { type: "stmt" }       (hoisted, not rendered in place)
 *   {expr}                  → { type: "expr" }
 *   {#if}…{:else if}…{/if}  → { type: "if", branches }
 *   {#each xs as x}…{/each} → { type: "each", list, item, index, body }
 *   <tag attr=…>…</tag>     → { type: "element", name, attrs, children, closed }
 *   ```lang / $$ / \[       → { type: "fence" }      (raw text, never DIL)
 *
 * Malformed input is the *normal* case: the source arrives a few dozen bytes at a time
 * while streaming, so almost every intermediate state is invalid. Following the
 * recovery rules in `dil.ebnf`, every failure becomes a diagnostic and parsing
 * continues with a best-effort AST — this module never throws.
 */

import { decodeEntities } from "./entities.ts";
import { markdownAtom, markdownLiteral } from "./markdown.ts";
import { type MarkdownSpan, markdownSpans } from "./markdown-syntax.ts";
import { LineIndex, readBalanced, readInlineCodeSpan, readInlineMathSpan, splitEachClause } from "./scanner.ts";
import type {
  DilAttribute,
  DilDiagnostic,
  DilDiagnosticCode,
  DilEachNode,
  DilElementNode,
  DilFenceNode,
  DilIfBranch,
  DilIfNode,
  DilNode,
  DilParseResult,
  DilRecoveryAction,
  DilStmtNode,
} from "./types.ts";
import { tagEntry } from "./vocabulary.ts";

/** Elements whose content is literal text, never DIL: code samples are full of braces. */
export const RAW_TEXT_TAGS: ReadonlySet<string> = new Set(["code", "code-block", "CodeBlock"]);

const TAG_NAME = /[A-Za-z_$][\w$]*(?:[-.][A-Za-z_$][\w$]*)*/y;
const ATTR_NAME = /[A-Za-z_$][\w$:-]*/y;
const SIMPLE_CLOSE = /\{\/([A-Za-z_$][\w$]*)\s*\}/y;
const SIMPLE_ELSE = /\{:else\s*\}/y;
const ELSE_IF = /\{:else\s+if\s/y;
const BLOCK_KEYWORDS: ReadonlySet<string> = new Set(["if", "each"]);
const EXPLICIT_REFERENCE = /!?\[(?:\\.|[^[\]\\\n])+\]\[(?:\\.|[^[\]\\\n])*\]/y;

type Stop =
  | { readonly kind: "eof" }
  | { readonly kind: "done" }
  | { readonly kind: "close-tag"; readonly name: string; readonly index: number }
  | { readonly kind: "else"; readonly cond: string | null; readonly length: number; readonly index: number }
  | { readonly kind: "close-block"; readonly name: string; readonly length: number; readonly index: number };

interface ParseContext {
  readonly src: string;
  i: number;
  readonly diag: Diagnostics;
  readonly tagStack: string[];
  readonly markdown: ReadonlyMap<number, MarkdownSpan>;
}

class Diagnostics {
  readonly items: DilDiagnostic[] = [];
  private readonly seen = new Set<string>();
  private readonly lineIndex: LineIndex;

  constructor(src: string) {
    this.lineIndex = new LineIndex(src);
  }

  add(
    code: DilDiagnosticCode,
    index: number,
    extra: {
      action?: DilRecoveryAction;
      directive?: string;
      tag?: string;
      expected?: string;
      found?: string;
      name?: string;
      fence?: string;
    } = {},
  ): void {
    const { line, column } = this.lineIndex.lineCol(index);
    const key = `${code}:${line}:${column}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push({ code, index, line, column, ...extra });
  }

  summary(): string {
    if (!this.items.length) return "clean";
    const counts = new Map<string, number>();
    for (const item of this.items) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    return [...counts].map(([code, count]) => `${code}×${count}`).join(" ");
  }
}

/** CRLF → LF and a leading BOM removed, so offsets and `LineIndex` agree everywhere. */
export function normalizeSource(source: string): string {
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  return withoutBom.includes("\r") ? withoutBom.replace(/\r\n?/g, "\n") : withoutBom;
}

export function parse(source: string): DilParseResult {
  const src = normalizeSource(source);
  const diag = new Diagnostics(src);
  const ctx: ParseContext = { src, i: 0, diag, tagStack: [], markdown: markdownSpans(src) };
  const { nodes } = parseNodes(ctx, null, false);
  return { nodes, diagnostics: diag.items, diagnosticSummary: diag.summary() };
}

/**
 * Parse a run of siblings. Stops at EOF, at a closing tag, or at a `{:…}` / `{/…}`
 * terminator (only when `inBlock`, i.e. the frame is a block body — terminators belong
 * to the block that owns them, not to `<box>` or to the document).
 */
function parseNodes(ctx: ParseContext, closeTag: string | null, inBlock: boolean): { nodes: DilNode[]; stop: Stop } {
  const { src } = ctx;
  const nodes: DilNode[] = [];
  let textStart = -1;

  const flush = (end: number): void => {
    if (textStart < 0) return;
    // Entities are left as written: the Markdown lexer decodes prose, and raw
    // elements decode in `readRawText`. Decoding here would decode twice.
    if (end > textStart) pushText(nodes, src.slice(textStart, end), textStart);
    textStart = -1;
  };

  while (ctx.i < src.length) {
    const c = src[ctx.i];
    const next = src[ctx.i + 1];
    const markdown = ctx.markdown.get(ctx.i);
    if (markdown && (markdown.node.type !== "html" || !tagAt(src, ctx.i, next === "/"))) {
      const atom =
        markdown.node.type === "html"
          ? null
          : markdownAtom(markdown.node, src.slice(ctx.i, markdown.end), ctx.i, markdown.end);
      if (atom) {
        flush(ctx.i);
        nodes.push(atom);
      } else if (textStart < 0) {
        textStart = ctx.i;
      }
      ctx.i = markdown.end;
      continue;
    }

    // A blockquote line is prose: a fence inside it (`> ~~~js`) has its prefix between the
    // line start and the marker, so DIL scanning must not read its braces as expressions.
    const quoted = isQuoteLine(src, ctx.i);

    // 1. FencedBlock — only ever at a line start, so inline backticks stay prose.
    if (!quoted && (ctx.i === 0 || src[ctx.i - 1] === "\n")) {
      const fence = readFenceOpen(src, ctx.i);
      // An indented fence at document level belongs to a Markdown container (a list
      // item's example), so it is prose that the Markdown lexer must see: taking it as a
      // DIL fence ends the list and splits it in two. Inside an element the indentation
      // is layout, so the fence stays a fence.
      const indented = fence !== null && documentLevelIndent(src, ctx.i) > 0 && ctx.tagStack.length === 0;
      if (fence && !indented) {
        flush(ctx.i);
        nodes.push(readFence(ctx, fence));
        continue;
      }
    }

    // 2. Inline code spans are prose atoms: `{#each …}` written inside one stays text.
    if (c === "`") {
      const span = readInlineCodeSpan(src, ctx.i);
      if (span) {
        if (textStart < 0) textStart = ctx.i;
        ctx.i = span.end;
        continue;
      }
    }

    // A reference without a matching definition is plain text to remark. Keep its label
    // literal too, including any formatting markers or braces it contains.
    if ((c === "[" || (c === "!" && next === "[")) && !isEscaped(src, ctx.i)) {
      const value = matchAt(EXPLICIT_REFERENCE, src, ctx.i);
      if (value) {
        flush(ctx.i);
        nodes.push(markdownLiteral(value, ctx.i, ctx.i + value.length));
        ctx.i += value.length;
        continue;
      }
    }

    // 3. Inline math (`$…$`, `\(…\)`) is a DIL node, not prose: the Markdown lexer
    //    would otherwise eat `\(` as an escape and mistake currency for LaTeX.
    if ((c === "$" || (c === "\\" && next === "(")) && !isEscaped(src, ctx.i)) {
      const math = readInlineMathSpan(src, ctx.i);
      if (math) {
        flush(ctx.i);
        const pos = ctx.i;
        ctx.i = math.end;
        nodes.push(mathNode(math.value, pos, math.end));
        continue;
      }
    }

    // 4. Closing element tag.
    if (!quoted && c === "<" && next === "/" && !isEscaped(src, ctx.i)) {
      const closing = readClosingTag(src, ctx.i);
      if (closing) {
        flush(ctx.i);
        ctx.i = closing.end;
        if (closeTag && closing.name === closeTag) {
          return { nodes, stop: { kind: "close-tag", name: closing.name, index: closing.index } };
        }
        if (ctx.tagStack.includes(closing.name)) {
          // Belongs to an ancestor: close there, dropping the frames in between.
          ctx.diag.add("mismatched_tag", closing.index, {
            expected: closeTag ?? "",
            found: closing.name,
            action: "recovered_parse",
          });
          return { nodes, stop: { kind: "close-tag", name: closing.name, index: closing.index } };
        }
        ctx.diag.add("mismatched_tag", closing.index, {
          expected: closeTag ?? "",
          found: closing.name,
          action: "dropped",
        });
        continue;
      }
    }

    // 5. Block terminators: `{:else}`, `{:else if x}`, `{/if}`, `{/each}`.
    if (!quoted && c === "{" && (next === ":" || next === "/") && !isEscaped(src, ctx.i)) {
      const terminator = readTerminator(ctx);
      if (terminator) {
        flush(ctx.i);
        if (inBlock) return { nodes, stop: terminator };
        ctx.diag.add("unexpected_terminator", ctx.i, { found: terminator.name, action: "dropped" });
        ctx.i += terminator.length;
        continue;
      }
      // Malformed terminator: keep the brace as prose, the diagnostic is already filed.
      if (textStart < 0) textStart = ctx.i;
      ctx.i++;
      continue;
    }

    // 6. `{@body …}` declarations.
    if (!quoted && c === "{" && next === "@" && !isEscaped(src, ctx.i)) {
      flush(ctx.i);
      const statement = readAppDirective(ctx);
      if (statement) nodes.push(statement);
      continue;
    }

    // 7. Control flow blocks.
    if (!quoted && c === "{" && next === "#" && !isEscaped(src, ctx.i)) {
      flush(ctx.i);
      const block = readBlock(ctx, closeTag);
      if (block.node) nodes.push(block.node);
      if (block.stop.kind === "close-tag") return { nodes, stop: block.stop };
      continue;
    }

    // 8. DIL elements. A `<` that cannot start a tag (`a < b`, `<https://…>`) is prose.
    const tag = !quoted && c === "<" && !isEscaped(src, ctx.i) ? tagAt(src, ctx.i) : null;
    if (tag) {
      flush(ctx.i);
      const element = readElement(ctx, tag);
      if (element.node) nodes.push(element.node);
      if (element.stop.kind !== "done") return { nodes, stop: element.stop };
      continue;
    }

    // 9. `{expression}` interpolation. An escaped brace stays prose.
    if (!quoted && c === "{" && !isEscaped(src, ctx.i)) {
      flush(ctx.i);
      const pos = ctx.i;
      const braced = readBalanced(src, pos);
      if (!braced.ok) ctx.diag.add("unterminated_braced_value", pos, { action: "recovered_parse" });
      const code = braced.inner.trim();
      if (code) nodes.push({ type: "expr", code, pos });
      ctx.i = braced.end;
      continue;
    }

    if (textStart < 0) textStart = ctx.i;
    ctx.i++;
  }

  flush(src.length);
  return { nodes, stop: { kind: "eof" } };
}

/** Keep whitespace between inline atoms. Markdown decides whether it separates paragraphs. */
function pushText(nodes: DilNode[], value: string, pos: number): void {
  const previous = nodes[nodes.length - 1];
  if (previous && previous.type === "text") {
    nodes[nodes.length - 1] = { ...previous, value: previous.value + value };
    return;
  }
  nodes.push({ type: "text", value, pos });
}

function tagAt(src: string, index: number, closing = false): string | null {
  const name = matchAt(TAG_NAME, src, index + (closing ? 2 : 1));
  const entry = name ? tagEntry(name) : undefined;
  if (!name || !entry || entry.syntheticOnly || entry.support === "internal") return null;
  const after = src[index + (closing ? 2 : 1) + name.length];
  return after === undefined || /[\s/>]/.test(after) ? name : null;
}

function execAt(pattern: RegExp, src: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(src);
}

function matchAt(pattern: RegExp, src: string, index: number): string | null {
  const match = execAt(pattern, src, index);
  return match ? match[0] : null;
}

/**
 * `\{` and `\<` are Markdown escapes: the character is prose, not a DIL construct. An odd
 * number of preceding backslashes escapes; `\\{x}` is a literal backslash plus a real
 * interpolation. Escaped text is left as written so Markdown lowering decodes it.
 */
/** Leading spaces/tabs of the line that starts at or before `index`. */
function documentLevelIndent(src: string, index: number): number {
  let i = index;
  let indent = 0;
  while (indent < 4 && (src[i] === " " || src[i] === "\t")) {
    i++;
    indent++;
  }
  return indent;
}

/** True when `index` sits on a line that carries a Markdown blockquote marker. */
function isQuoteLine(src: string, index: number): boolean {
  let i = src.lastIndexOf("\n", index - 1) + 1;
  let markers = 0;
  while (i < index) {
    while (i < index && (src[i] === " " || src[i] === "\t")) i++;
    if (src[i] !== ">") break;
    markers++;
    i++;
  }
  return markers > 0;
}

function isEscaped(src: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function skipWhitespace(src: string, index: number): number {
  let i = index;
  while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\r" || src[i] === "\n")) i++;
  return i;
}

/** `</name>` — returns null when this is not a closing tag at all ("a </ b"). */
function readClosingTag(
  src: string,
  index: number,
): { readonly name: string; readonly end: number; readonly index: number } | null {
  const name = tagAt(src, index, true);
  if (!name) return null;
  const gt = src.indexOf(">", index + 2 + name.length);
  if (gt < 0) return null;
  return { name, end: gt + 1, index };
}

/**
 * `{:else}`, `{:else if expr}`, `{/if}`, `{/each}` — peeked, never consumed: the caller
 * decides whether it closes the current block or is a stray terminator.
 */
function readTerminator(ctx: ParseContext): (Stop & { readonly length: number; readonly name?: string }) | null {
  const { src, i } = ctx;

  const close = execAt(SIMPLE_CLOSE, src, i);
  if (close) return { kind: "close-block", name: close[1], length: close[0].length, index: i };

  const elseOnly = execAt(SIMPLE_ELSE, src, i);
  if (elseOnly) return { kind: "else", cond: null, name: "else", length: elseOnly[0].length, index: i };

  if (execAt(ELSE_IF, src, i)) {
    const braced = readBalanced(src, i);
    if (!braced.ok) ctx.diag.add("unterminated_braced_value", i, { directive: "if", action: "recovered_parse" });
    const cond = braced.inner.replace(/^:else\s+if\s+/, "").trim() || "false";
    return { kind: "else", cond, name: "else", length: braced.end - i, index: i };
  }

  ctx.diag.add("malformed_terminator", i, { action: "recovered_parse" });
  return null;
}

/** A balanced region that swallowed the next directive or tag line has eaten too much. */
function runsIntoNextDirective(inner: string): boolean {
  return /\n\s*(\{@|<[A-Za-z])/.test(inner);
}

/** `{@body …}` — one or more statements hoisted into the render function. */
function readAppDirective(ctx: ParseContext): DilStmtNode | null {
  const { src } = ctx;
  const pos = ctx.i;
  let braced = readBalanced(src, pos);

  if (!braced.ok || runsIntoNextDirective(braced.inner)) {
    // Unterminated. If the model dropped the closing `}` and moved on, the balanced
    // scan swallows the rest of the document. A directive is one line, so recover at
    // the end of the line it started on.
    const eol = src.indexOf("\n", pos);
    if (eol < 0) {
      // Still being streamed — `{@body co` is not a statement yet.
      ctx.diag.add("unterminated_braced_value", pos, { directive: "body", action: "deferred" });
      ctx.i = src.length;
      return null;
    }
    ctx.diag.add("unterminated_braced_value", pos, { directive: "body", action: "recovered_parse" });
    braced = { inner: src.slice(pos + 1, eol), end: eol, ok: false };
  }
  ctx.i = braced.end;

  const match = /^\s*([A-Za-z_$][\w$]*)\s+([\s\S]*)$/.exec(braced.inner.slice(1));
  if (!match) {
    ctx.diag.add("empty_app_directive", pos, { action: "dropped" });
    return null;
  }
  const name = match[1];
  const code = match[2].trim();
  if (!code) {
    ctx.diag.add("empty_app_directive", pos, { action: "dropped" });
    return null;
  }
  if (name !== "body") {
    ctx.diag.add("unknown_directive", pos, { found: name, action: "dropped" });
    return null;
  }
  return { type: "stmt", name, code, pos };
}

function readBlock(ctx: ParseContext, closeTag: string | null): { node: DilIfNode | DilEachNode | null; stop: Stop } {
  const { src } = ctx;
  const pos = ctx.i;
  const braced = readBalanced(src, pos);
  if (!braced.ok) ctx.diag.add("unterminated_braced_value", pos, { action: "recovered_parse" });
  ctx.i = braced.end;

  const match = /^#\s*([A-Za-z_$][\w$]*)\s*([\s\S]*)$/.exec(braced.inner.trim());
  if (!match || !BLOCK_KEYWORDS.has(match[1])) {
    ctx.diag.add("unknown_block", pos, { found: match ? match[1] : "", action: "dropped" });
    return { node: null, stop: braced.ok ? { kind: "done" } : { kind: "eof" } };
  }
  return match[1] === "if"
    ? readIf(ctx, closeTag, pos, match[2].trim())
    : readEach(ctx, closeTag, pos, match[2].trim());
}

function readIf(
  ctx: ParseContext,
  closeTag: string | null,
  pos: number,
  firstCond: string,
): { node: DilIfNode; stop: Stop } {
  const branches: DilIfBranch[] = [];
  let cond: string | null = firstCond;

  for (;;) {
    const body = parseNodes(ctx, closeTag, true);
    branches.push({ cond, body: body.nodes });
    const stop = body.stop;

    if (stop.kind === "else") {
      ctx.i += stop.length;
      cond = stop.cond;
      continue;
    }
    if (stop.kind === "close-block") {
      ctx.i += stop.length;
      if (stop.name !== "if") {
        ctx.diag.add("mismatched_block_close", stop.index, {
          expected: "if",
          found: stop.name,
          action: "recovered_parse",
        });
      }
      return { node: { type: "if", pos, branches }, stop: { kind: "done" } };
    }
    ctx.diag.add("unclosed_block", pos, { directive: "if", action: "recovered_parse" });
    return { node: { type: "if", pos, branches }, stop };
  }
}

function readEach(
  ctx: ParseContext,
  closeTag: string | null,
  pos: number,
  head: string,
): { node: DilEachNode; stop: Stop } {
  const clause = splitEachClause(head);
  if (!clause) ctx.diag.add("malformed_each", pos, { action: "recovered_parse" });

  const body = parseNodes(ctx, closeTag, true);
  let stop: Stop = { kind: "done" };
  if (body.stop.kind === "close-block") {
    ctx.i += body.stop.length;
    if (body.stop.name !== "each") {
      ctx.diag.add("mismatched_block_close", body.stop.index, {
        expected: "each",
        found: body.stop.name,
        action: "recovered_parse",
      });
    }
  } else {
    ctx.diag.add("unclosed_block", pos, { directive: "each", action: "recovered_parse" });
    stop = body.stop;
  }

  return {
    node: {
      type: "each",
      pos,
      list: clause ? clause.list : "[]",
      pattern: clause ? clause.pattern : "item",
      item: clause ? clause.item : "item",
      index: clause ? clause.index : null,
      body: body.nodes,
    },
    stop,
  };
}

function readElement(ctx: ParseContext, name: string): { node: DilElementNode | null; stop: Stop } {
  const { src } = ctx;
  const pos = ctx.i;
  const open = readAttributes(ctx, name, pos + 1 + name.length);
  if (!open.complete) {
    // Rule: unterminated opening tag at EOF → DropErrorNode (no half-tag flash).
    ctx.diag.add("unterminated_tag", pos, { tag: name, action: "dropped" });
    ctx.i = src.length;
    return { node: null, stop: { kind: "eof" } };
  }

  ctx.i = open.end;
  if (open.selfClosing) {
    return { node: element(name, open.attrs, [], pos, open.end, true), stop: { kind: "done" } };
  }
  if (RAW_TEXT_TAGS.has(name)) return readRawText(ctx, name, open.attrs, pos);

  ctx.tagStack.push(name);
  const body = parseNodes(ctx, name, false);
  ctx.tagStack.pop();

  let closed = false;
  let stop: Stop = { kind: "done" };
  if (body.stop.kind === "close-tag") {
    closed = body.stop.name === name;
    if (!closed) stop = body.stop; // an ancestor is closing: propagate
  } else {
    // Rule: missing `</name>` at EOF → InsertMissingClose, node stays, `closed: false`.
    ctx.diag.add("unclosed_tag", pos, { tag: name, action: "recovered_parse" });
  }

  return { node: element(name, open.attrs, body.nodes, pos, ctx.i, closed), stop };
}

/** Everything up to `</name>` is one raw text node (entities decoded). */
function readRawText(
  ctx: ParseContext,
  name: string,
  attrs: DilAttribute[],
  pos: number,
): { node: DilElementNode; stop: Stop } {
  const { src } = ctx;
  const closing = new RegExp(`</${escapeRegExp(name)}\\s*>`, "g");
  closing.lastIndex = ctx.i;
  const match = closing.exec(src);
  const end = match ? match.index : src.length;
  const value = decodeEntities(src.slice(ctx.i, end));
  const children: DilNode[] = value ? [{ type: "text", value, pos: ctx.i, raw: true }] : [];

  if (!match) {
    ctx.diag.add("unclosed_tag", pos, { tag: name, action: "recovered_parse" });
    ctx.i = src.length;
    return { node: element(name, attrs, children, pos, src.length, false), stop: { kind: "eof" } };
  }

  ctx.i = match.index + match[0].length;
  return { node: element(name, attrs, children, pos, ctx.i, true), stop: { kind: "done" } };
}

interface OpenTag {
  readonly attrs: DilAttribute[];
  readonly end: number;
  readonly selfClosing: boolean;
  /** False when the tag ran to EOF without `>` or `/>`. */
  readonly complete: boolean;
}

/**
 * Attribute forms: `name="str"`, `name={expr}`, `name=raw`, bare `name` (= true).
 * Returns at `>` / `/>`, or at EOF with `complete: false`.
 */
function readAttributes(ctx: ParseContext, tag: string, start: number): OpenTag {
  const { src } = ctx;
  const attrs: DilAttribute[] = [];
  let i = start;

  while (i < src.length) {
    i = skipWhitespace(src, i);
    if (i >= src.length) break;
    if (src.startsWith("/>", i)) return { attrs, end: i + 2, selfClosing: true, complete: true };
    if (src[i] === ">") return { attrs, end: i + 1, selfClosing: false, complete: true };
    if (src[i] === "/") {
      ctx.diag.add("malformed_attribute", i, { tag, action: "recovered_parse" });
      i++;
      continue;
    }

    const name = matchAt(ATTR_NAME, src, i);
    if (!name) {
      ctx.diag.add("malformed_attribute", i, { tag, found: src[i], action: "recovered_parse" });
      i++;
      continue;
    }
    const namePos = i;
    i = skipWhitespace(src, i + name.length);
    if (src[i] !== "=") {
      attrs.push({ name, kind: "boolean", value: true, pos: namePos });
      continue;
    }

    i = skipWhitespace(src, i + 1);
    const quote = src[i];
    if (quote === '"' || quote === "'") {
      const valuePos = i;
      let k = i + 1;
      let raw = "";
      while (k < src.length && src[k] !== quote) {
        if (src[k] === "\\") {
          raw += src[k] + (src[k + 1] ?? "");
          k += 2;
          continue;
        }
        raw += src[k];
        k++;
      }
      if (k >= src.length) {
        ctx.diag.add("unterminated_string", valuePos, { tag, action: "recovered_parse" });
        return { attrs, end: src.length, selfClosing: false, complete: false };
      }
      attrs.push({ name, kind: "string", value: decodeString(raw), pos: valuePos });
      i = k + 1;
      continue;
    }

    if (quote === "{") {
      const braced = readBalanced(src, i);
      if (!braced.ok) {
        ctx.diag.add("unterminated_braced_value", i, { tag, action: "recovered_parse" });
        return { attrs, end: src.length, selfClosing: false, complete: false };
      }
      attrs.push({ name, kind: "expr", value: braced.inner.trim(), pos: i });
      i = braced.end;
      continue;
    }

    // Bare value (`gap=2`, `width=100%`): tolerated for streaming, not in the grammar.
    let k = i;
    while (k < src.length && !/[\s>]/.test(src[k]) && !(src[k] === "/" && src[k + 1] === ">")) k++;
    attrs.push({ name, kind: "raw", value: src.slice(i, k), pos: i });
    i = k;
  }

  return { attrs, end: src.length, selfClosing: false, complete: false };
}

// ---------------------------------------------------------------------------
// Fenced blocks — FencedRawMode: `<`, `>`, `{`, `}` inside are plain text
// ---------------------------------------------------------------------------

interface FenceOpen {
  readonly marker: "`" | "~" | "$$" | "\\[";
  readonly length: number;
  readonly info: string;
  readonly contentStart: number;
}

/** Reads the opening line of a fenced block; `lineStart` must be at a line start. */
function readFenceOpen(src: string, lineStart: number): FenceOpen | null {
  let i = lineStart;
  let indent = 0;
  while (indent < 3 && (src[i] === " " || src[i] === "\t")) {
    i++;
    indent++;
  }

  const marker = src[i];
  if (marker === "`" || marker === "~") {
    if (!src.startsWith(marker.repeat(3), i)) return null;
    let k = i;
    while (src[k] === marker) k++;
    const length = k - i;
    const lineEnd = src.indexOf("\n", k);
    const stop = lineEnd < 0 ? src.length : lineEnd;
    const info = src.slice(k, stop).trim();
    // A backtick info string containing a backtick is not a fence (CommonMark rule).
    if (marker === "`" && info.includes("`")) return null;
    return { marker, length, info, contentStart: lineEnd < 0 ? src.length : lineEnd + 1 };
  }

  if (src.startsWith("$$", i)) return { marker: "$$", length: 2, info: "", contentStart: i + 2 };
  if (src.startsWith("\\[", i)) return { marker: "\\[", length: 2, info: "", contentStart: i + 2 };
  return null;
}

function readFence(ctx: ParseContext, open: FenceOpen): DilFenceNode {
  const { src } = ctx;
  const pos = ctx.i;

  if (open.marker === "`" || open.marker === "~") {
    const closing = findClosingFenceLine(src, open);
    if (!closing) {
      ctx.diag.add("incomplete_source", pos, { fence: open.marker.repeat(open.length), action: "recovered_parse" });
      const value = stripTrailingNewline(src.slice(open.contentStart));
      ctx.i = src.length;
      return { type: "fence", kind: "code", info: open.info, value, pos, end: src.length, closed: false };
    }
    const value = stripTrailingNewline(src.slice(open.contentStart, closing.start));
    ctx.i = closing.end;
    return { type: "fence", kind: "code", info: open.info, value, pos, end: closing.end, closed: true };
  }

  const closer = open.marker === "$$" ? "$$" : "\\]";
  const at = src.indexOf(closer, open.contentStart);
  if (at < 0) {
    ctx.diag.add("incomplete_source", pos, { fence: open.marker, action: "recovered_parse" });
    const value = stripTrailingNewline(src.slice(open.contentStart));
    ctx.i = src.length;
    return { type: "fence", kind: "math", info: "", value, pos, end: src.length, closed: false };
  }
  const value = src.slice(open.contentStart, at).replace(/^\n/, "").replace(/\n$/, "");
  ctx.i = at + closer.length;
  return { type: "fence", kind: "math", info: "", value, pos, end: ctx.i, closed: true };
}

function findClosingFenceLine(src: string, open: FenceOpen): { readonly start: number; readonly end: number } | null {
  let i = open.contentStart;
  const marker = open.marker as "`" | "~";
  while (i < src.length) {
    const eol = src.indexOf("\n", i);
    const lineEnd = eol < 0 ? src.length : eol;
    let k = i;
    let indent = 0;
    while (indent < 3 && (src[k] === " " || src[k] === "\t")) {
      k++;
      indent++;
    }
    let run = 0;
    while (src[k + run] === marker) run++;
    if (run >= open.length) {
      const rest = src.slice(k + run, lineEnd);
      if (!rest.trim()) return { start: i, end: eol < 0 ? src.length : eol + 1 };
    }
    if (eol < 0) break;
    i = eol + 1;
  }
  return null;
}

function stripTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

/** Inline math: `<math value="…"/>`, produced by the parser rather than by Markdown. */
function mathNode(value: string, pos: number, end: number): DilElementNode {
  return {
    type: "element",
    name: "math",
    attrs: [{ name: "value", kind: "string", value, pos }],
    children: [],
    pos,
    end,
    closed: true,
    synthetic: true,
  };
}

function element(
  name: string,
  attrs: DilAttribute[],
  children: DilNode[],
  pos: number,
  end: number,
  closed: boolean,
): DilElementNode {
  return { type: "element", name, attrs, children, pos, end, closed };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeString(raw: string): string {
  if (!raw.includes("\\")) return raw;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\" || i + 1 >= raw.length) {
      out += c;
      continue;
    }
    const escaped = raw[i + 1];
    i++;
    if (escaped === "n") out += "\n";
    else if (escaped === "t") out += "\t";
    else if (escaped === "r") out += "\r";
    else if (escaped === "b") out += "\b";
    else if (escaped === "f") out += "\f";
    else if (escaped === "v") out += "\v";
    else if (escaped === "0") out += "\0";
    else if (escaped === "\n") continue;
    else if (escaped === "u") {
      const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(raw.slice(i + 1));
      if (braced) {
        const codePoint = Number.parseInt(braced[1], 16);
        // `String.fromCodePoint` throws above U+10FFFF; keep the escape visible instead.
        if (codePoint <= 0x10ffff) {
          out += String.fromCodePoint(codePoint);
        } else {
          out += `\\u${braced[0]}`;
        }
        i += braced[0].length;
        continue;
      }
      const hex = raw.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 4;
      } else out += "u";
    } else if (escaped === "x") {
      const hex = raw.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
      } else out += "x";
    } else out += escaped;
  }
  return out;
}
