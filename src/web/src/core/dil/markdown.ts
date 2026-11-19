/**
 * Markdown lowering — the injection layer between DIL structure and prose.
 *
 * `dil.ebnf` §1 and §7 split prose into two tiers, and this module follows that split
 * exactly:
 *
 *   document level  `BlockProse`  full GFM block Markdown (headings, lists, tables,
 *                                 quotes, rules) — `unified` + `remark-parse` + `remark-gfm`,
 *                                 with CommonMark's indented code block disabled because
 *                                 DIL indentation is layout and code is always fenced.
 *
 *   element level   `InlineProse` **no** block Markdown at all: blank lines are the only
 *                                 paragraph separator. Inline syntax uses the same lexer.
 *
 * Block → DIL mapping (document level only):
 *
 *   # 标题                  → <title size="xl"|"lg"|"md">
 *   段落 **粗体**           → <text>…<bold>…</bold>…</text>
 *   - 一项 / 1. 一项        → <list marker="bullet|number"><list-item>…</list-item></list>
 *   | a | b |               → <table><table-row><table-cell header>…</table-cell>…
 *   > 引用                  → <blockquote>
 *   ---                     → <divider>
 *   ~~删~~                  → <text lineThrough>   (inline, both tiers)
 *   [label](url)            → <Link url="…" title="…">
 *   ![alt](https://…)       → a lazily loaded image
 *
 * Inline DIL nodes (`math`, `Link`, `icon`, `badge`, `bold`, `italic`, `code`) and
 * `{expr}` interpolations stay inside the surrounding flow in both tiers, so
 * `公式 $E = mc^2$ 与…` keeps its spaces and its line.
 */

import type { Code, List, ListItem, PhrasingContent, RootContent, Table, TableRow } from "mdast";
import { parseInline } from "./inline.ts";
import { parseMarkdown } from "./markdown-syntax.ts";
import { repairStreamTail } from "./stream-repair.ts";
import type { DilAttribute, DilElementNode, DilFenceNode, DilNode } from "./types.ts";
import { isInlineTag } from "./vocabulary.ts";

const HEADING_SIZE: Record<number, string> = { 1: "xl", 2: "lg", 3: "md", 4: "md", 5: "md", 6: "md" };

/** Which grammar tier the prose being lowered belongs to (`dil.ebnf` §1). */
export type ProseTier = "document" | "element";

export interface LowerOptions {
  /** `document` (default) or `element`. */
  readonly document?: boolean;
  /**
   * Length of the source these nodes came from. The prose fragment that reaches it is
   * the streaming tail, and it is the only one `stream-repair.ts` is allowed to touch.
   * Omitted → nothing is repaired.
   */
  readonly sourceLength?: number;
}

export function lowerMarkdown(nodes: DilNode[], options: LowerOptions = {}): DilNode[] {
  const tier = options.document === false ? "element" : "document";
  return lowerNodes(nodes, tier, options.sourceLength);
}

/** InlineRun on a bare string — the element-interior subset, no block parsing. */
export function lowerInline(text: string, pos: number): DilNode[] {
  return parseInline(text, pos);
}

/** ```lang → `<code-block language>`; $$ → `<math block value>`. */
export function fenceToElement(fence: DilFenceNode): DilElementNode {
  if (fence.kind === "math") {
    return {
      ...el("math", [], fence.pos, fence.end, [
        stringAttr("value", fence.value, fence.pos),
        booleanAttr("block", fence.pos),
      ]),
      closed: fence.closed,
    };
  }
  const attrs = fence.info ? [stringAttr("language", firstWord(fence.info), fence.pos)] : [];
  const children: DilNode[] = fence.value ? [{ type: "text", value: fence.value, pos: fence.pos, raw: true }] : [];
  return { ...el("code-block", children, fence.pos, fence.end, attrs), closed: fence.closed };
}

function lowerNodes(nodes: DilNode[], tier: ProseTier, sourceLength?: number): DilNode[] {
  return tier === "document" ? lowerDocumentProse(nodes, sourceLength) : lowerInlineProse(nodes, sourceLength);
}

function lowerNode(node: DilNode, tier: ProseTier, sourceLength?: number): DilNode {
  switch (node.type) {
    case "element":
      return node.synthetic ? node : { ...node, children: lowerNodes(node.children, "element", sourceLength) };
    case "if":
      return {
        ...node,
        branches: node.branches.map((branch) => ({ ...branch, body: lowerNodes(branch.body, tier, sourceLength) })),
      };
    case "each":
      return { ...node, body: lowerNodes(node.body, tier, sourceLength) };
    case "fence":
      return fenceToElement(node);
    default:
      return node;
  }
}

// ---------------------------------------------------------------------------
// Document tier — BlockProse (full GFM)
// ---------------------------------------------------------------------------

function lowerDocumentProse(nodes: DilNode[], sourceLength?: number): DilNode[] {
  const out: DilNode[] = [];
  let run: DilNode[] = [];

  const flushRun = (): void => {
    if (!run.length) return;
    // Inline nodes become placeholders, so CommonMark still sees one line and can
    // recognize `- <Link/>` as a list item; the nodes are substituted back afterwards.
    const prose = composeProse(run, isTail(run, sourceLength));
    // A run that is only layout whitespace carries no paragraph.
    run = [];
    if (prose.nodes.length || /\S/.test(prose.text)) out.push(...blockProse(prose, sourceLength !== undefined));
  };

  for (const node of nodes) {
    if (node.type === "expr" || (node.type === "element" && isInlineTag(node.name))) {
      run.push(node);
      continue;
    }
    if (node.type === "text") {
      // Feed the whole run to the Markdown lexer: blank lines are *its* block separator.
      // Splitting here makes a loose list (`1. a\n\n2. b`) two lists, both starting at 1,
      // and moves a list item's continuation paragraph out of the item.
      //
      // Whitespace-only nodes are kept too: `<bold>Hello</bold> <italic>world</italic>`
      // carries its space in one, and dropping it renders `Helloworld`. A run that is
      // *only* whitespace is dropped in `flushRun`.
      run.push(node);
      continue;
    }
    flushRun();
    out.push(lowerNode(node, "document", sourceLength));
  }
  flushRun();
  return out;
}

/** Raw source offset just past `node` — the tail test needs the source, not the tree. */
function nodeEnd(node: DilNode): number {
  switch (node.type) {
    case "text":
      return node.pos + node.value.length;
    case "element":
    case "fence":
      return node.end;
    default:
      return -1;
  }
}

/** True when this run still owns the end of the source: the streaming tail. */
function isTail(run: readonly DilNode[], sourceLength?: number): boolean {
  if (sourceLength === undefined) return false;
  const last = run[run.length - 1];
  return last !== undefined && nodeEnd(last) === sourceLength;
}

function blockProse(prose: CompositeProse, isStreaming: boolean): DilNode[] {
  return contentNodes(parseMarkdown(prose.text, isStreaming ? "streaming" : "document").children, prose);
}

// ---------------------------------------------------------------------------
// Composite prose — inline nodes as placeholders for the block lexer
// ---------------------------------------------------------------------------

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE001/g;

interface ProseMap {
  /** Composite offset (what the Markdown lexer saw) → DIL source offset. */
  toOriginal(offset: number): number;
}

interface CompositeProse extends ProseMap {
  readonly text: string;
  /** Inline nodes, indexed by placeholder id. */
  readonly nodes: readonly DilNode[];
}

interface Piece {
  readonly composite: number;
  readonly original: number;
  readonly length: number;
}

/**
 * One prose run → one Markdown source string. `{expr}` and inline DIL elements are
 * replaced by private-use placeholders of the same role, and the composite→source
 * offset map keeps every node position pointing at the real source.
 */
function composeProse(run: readonly DilNode[], atTail = false): CompositeProse {
  const nodes: DilNode[] = [];
  const pieces: Piece[] = [];
  let text = "";

  for (const node of run) {
    if (node.type === "text") {
      pieces.push({ composite: text.length, original: node.pos, length: node.value.length });
      text += node.value;
      continue;
    }
    const token = `${PLACEHOLDER_START}${nodes.length}${PLACEHOLDER_END}`;
    pieces.push({ composite: text.length, original: node.pos, length: token.length });
    text += token;
    nodes.push(lowerNode(node, "document"));
  }

  // Only at the streaming tail: a finished prose run keeps its bytes, so a document
  // that is already complete lowers to exactly what its author wrote.
  if (atTail) text = repairStreamTail(text);

  const toOriginal = (offset: number): number => {
    let low = 0;
    let high = pieces.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (pieces[mid].composite <= offset) low = mid;
      else high = mid - 1;
    }
    const piece = pieces[low];
    if (!piece) return 0;
    const delta = Math.min(Math.max(offset - piece.composite, 0), piece.length);
    return piece.original + delta;
  };

  return { text, nodes, toOriginal };
}

/** Replace placeholders inside an mdast text value with the inline nodes they stood for. */
function expandPlaceholders(value: string, pos: number, prose: ProseMap & { nodes: readonly DilNode[] }): DilNode[] {
  const out: DilNode[] = [];
  let last = 0;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  for (let match = PLACEHOLDER_PATTERN.exec(value); match; match = PLACEHOLDER_PATTERN.exec(value)) {
    if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index), pos });
    const node = prose.nodes[Number(match[1])];
    if (node) out.push(node);
    last = match.index + match[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last), pos });
  return out;
}

function stripPlaceholders(value: string): string {
  return value.replace(PLACEHOLDER_PATTERN, "");
}

// ---------------------------------------------------------------------------
// Element tier — InlineProse (no block Markdown)
// ---------------------------------------------------------------------------

/**
 * `InlineProse ::= InlineRun ( BlankLine+ InlineRun )*`.
 *
 * A single run is emitted unwrapped, so `<row>数量：{n} 与 **两种**</row>` stays a flex
 * row of inline nodes; several runs (blank-line separated) each become one `<text>`.
 *
 * The same placeholders as the document tier let emphasis span inline DIL elements.
 */
function lowerInlineProse(input: DilNode[], sourceLength?: number): DilNode[] {
  const pieces: Array<{ readonly nodes: DilNode[]; readonly tail: boolean } | { readonly block: DilNode }> = [];
  let prose: DilNode[] = [];

  const flushProse = (): void => {
    const tail = isTail(prose, sourceLength);
    const trimmed = trimProseEdges(prose);
    if (trimmed.length) pieces.push({ nodes: trimmed, tail });
    prose = [];
  };

  for (const node of input) {
    if (node.type === "text") {
      if (node.raw) {
        prose.push(node);
        continue;
      }
      let start = 0;
      for (const blank of node.value.matchAll(/\n[ \t]*\n/g)) {
        if (blank.index > start)
          prose.push({ ...node, value: node.value.slice(start, blank.index), pos: node.pos + start });
        flushProse();
        start = blank.index + blank[0].length;
      }
      if (start < node.value.length) prose.push({ ...node, value: node.value.slice(start), pos: node.pos + start });
      continue;
    }
    if (node.type === "expr" || (node.type === "element" && isInlineTag(node.name))) {
      prose.push(node);
      continue;
    }
    flushProse();
    pieces.push({ block: lowerNode(node, "element", sourceLength) });
  }
  flushProse();

  const proseCount = pieces.filter((piece) => "nodes" in piece).length;
  const out: DilNode[] = [];
  for (const piece of pieces) {
    if ("block" in piece) {
      out.push(piece.block);
      continue;
    }
    const children =
      piece.nodes.length === 1 && piece.nodes[0].type === "text" && piece.nodes[0].raw
        ? piece.nodes
        : inlineProse(composeProse(piece.nodes, piece.tail));
    if (!children.length) continue;
    if (proseCount > 1) {
      const pos = piece.nodes[0].pos;
      out.push(el("text", children, pos, pos));
    } else {
      out.push(...children);
    }
  }
  return out;
}

/** Leading indentation and trailing layout whitespace are XML formatting, not content. */
function trimProseEdges(nodes: DilNode[]): DilNode[] {
  const out = [...nodes];
  trimStart(out);
  trimEnd(out);
  return out;
}

function trimStart(nodes: DilNode[]): void {
  while (nodes.length) {
    const first = nodes[0];
    if (first.type !== "text" || first.raw) return;
    const trimmed = first.value.replace(/^[ \t\r\n]+/, "");
    if (trimmed) {
      nodes[0] = { ...first, value: trimmed, pos: first.pos + first.value.length - trimmed.length };
      return;
    }
    nodes.shift();
  }
}

function trimEnd(nodes: DilNode[]): void {
  while (nodes.length) {
    const last = nodes[nodes.length - 1];
    if (last.type !== "text" || last.raw) return;
    const trimmed = last.value.replace(/[ \t\r\n]+$/, "");
    if (trimmed) {
      nodes[nodes.length - 1] = { ...last, value: trimmed };
      return;
    }
    nodes.pop();
  }
}

// ---------------------------------------------------------------------------
// mdast → DIL (document tier only)
// ---------------------------------------------------------------------------

function contentNodes(children: readonly RootContent[], prose: CompositeProse): DilNode[] {
  const out: DilNode[] = [];
  for (const child of children) out.push(...contentNode(child, prose));
  return out;
}

function contentNode(node: RootContent, prose: CompositeProse): DilNode[] {
  const { pos, end } = spanOf(node, prose);

  switch (node.type) {
    case "paragraph":
      return [el("text", phrasingNodes(node.children, prose), pos, end)];
    case "heading":
      return [
        el("title", phrasingNodes(node.children, prose), pos, end, [
          stringAttr("size", HEADING_SIZE[node.depth] ?? "md", pos),
          stringAttr("level", String(node.depth), pos),
        ]),
      ];
    case "list":
      return [listElement(node, prose)];
    case "blockquote":
      return [el("blockquote", contentNodes(node.children, prose), pos, end)];
    case "thematicBreak":
      return [el("divider", [], pos, end)];
    case "code":
      return [codeBlockElement(node, sourceOf(node, prose), pos, end)];
    case "table":
      return [tableElement(node, prose)];
    case "math":
      return [el("math", [], pos, end, [stringAttr("value", node.value, pos), booleanAttr("block", pos)])];
    case "html":
    case "yaml":
    case "definition":
    case "footnoteDefinition":
      return [el("text", [markdownLiteral(sourceOf(node, prose), pos, end)], pos, end)];
    default:
      return [el("text", phrasingNodes(phrasingOf(node), prose), pos, end)];
  }
}

function phrasingOf(node: RootContent): PhrasingContent[] {
  const children = (node as { children?: PhrasingContent[] }).children;
  return Array.isArray(children) ? children : [];
}

function codeBlockElement(node: Code, source: string, pos: number, end: number): DilElementNode {
  const attrs = node.lang ? [stringAttr("language", firstWord(node.lang), pos)] : [];
  const children: DilNode[] = node.value ? [{ type: "text", value: node.value, pos, raw: true }] : [];
  const lines = source.trimEnd().split("\n");
  const marker = /^(?:`{3,}|~{3,})/.exec(lines[0])?.[0];
  const last = lines.at(-1)?.replace(/^[\s>]+/, "") ?? "";
  const closed =
    !marker || (lines.length > 1 && last.startsWith(marker) && [...last].every((char) => char === marker[0]));
  return { ...el("code-block", children, pos, end, attrs), closed };
}

function listElement(node: List, prose: CompositeProse): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  const attrs = [stringAttr("marker", node.ordered ? "number" : "bullet", pos)];
  if (node.ordered && typeof node.start === "number" && node.start !== 1) {
    attrs.push(stringAttr("start", String(node.start), pos));
  }
  const items = node.children.map((item) => listItemElement(item, prose));
  return el("list", items, pos, end, attrs);
}

function listItemElement(node: ListItem, prose: CompositeProse): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  const attrs = typeof node.checked === "boolean" ? [stringAttr("checked", String(node.checked), pos)] : [];
  return el("list-item", contentNodes(node.children, prose), pos, end, attrs);
}

function tableElement(node: Table, prose: CompositeProse): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  // `| :--- | :---: | ---: |` — mdast keeps the column alignment, the cells carry it on so
  // the renderer and the copy-back projection can both honour it.
  const align = node.align ?? [];
  const rows = node.children.map((row, index) => tableRowElement(row, index === 0, align, prose));
  return el("table", rows, pos, end);
}

function tableRowElement(
  node: TableRow,
  header: boolean,
  align: readonly (string | null)[],
  prose: CompositeProse,
): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  const cells = node.children.map((cell, column) => {
    const cellSpan = spanOf(cell, prose);
    const attrs = header ? [booleanAttr("header", cellSpan.pos)] : [];
    const textAlign = align[column];
    if (textAlign) attrs.push(stringAttr("textAlign", textAlign, cellSpan.pos));
    return el("table-cell", phrasingNodes(cell.children, prose), cellSpan.pos, cellSpan.end, attrs);
  });
  return el("table-row", cells, pos, end);
}

function phrasingNodes(children: readonly PhrasingContent[], prose: CompositeProse): DilNode[] {
  const out: DilNode[] = [];
  for (const child of children) {
    const { pos, end } = spanOf(child, prose);
    switch (child.type) {
      case "text":
        out.push(...expandPlaceholders(child.value, pos, prose));
        break;
      case "strong":
        out.push(el("bold", phrasingNodes(child.children, prose), pos, end));
        break;
      case "emphasis":
        out.push(el("italic", phrasingNodes(child.children, prose), pos, end));
        break;
      case "delete":
        out.push(el("text", phrasingNodes(child.children, prose), pos, end, [booleanAttr("lineThrough", pos)]));
        break;
      case "inlineCode":
        out.push(el("code", [{ type: "text", value: child.value, pos, raw: true }], pos, end));
        break;
      case "link": {
        const attrs = [stringAttr("url", child.url, pos)];
        if (child.title) attrs.push(stringAttr("title", child.title, pos));
        out.push(el("Link", phrasingNodes(child.children, prose), pos, end, attrs));
        break;
      }
      case "image":
      case "html":
      case "footnoteReference":
      case "linkReference":
      case "imageReference": {
        const atom = markdownAtom(child, sourceOf(child, prose), pos, end);
        if (atom) out.push(atom);
        break;
      }
      case "inlineMath":
        out.push(el("math", [], pos, end, [stringAttr("value", child.value, pos)]));
        break;
      case "break":
        out.push(el("hard-break", [], pos, end));
        break;
      default:
        out.push({ type: "text", value: stripPlaceholders(plainText(phrasingOf(child as RootContent))), pos });
        break;
    }
  }
  return out;
}

function inlineProse(prose: CompositeProse): DilNode[] {
  return parseMarkdown(prose.text, "inline").children.flatMap((node) =>
    node.type === "paragraph" ? phrasingNodes(node.children, prose) : contentNode(node, prose),
  );
}

function sourceOf(node: RootContent, prose: CompositeProse): string {
  return prose.text.slice(node.position?.start.offset, node.position?.end.offset);
}

/** Intercept these as whole source spans before their contents can be read as DIL. */
export function markdownAtom(node: RootContent, source: string, pos: number, end: number): DilElementNode | null {
  switch (node.type) {
    case "image":
      if (isHttpsImageUrl(node.url)) {
        const attrs = [stringAttr("src", node.url, pos), stringAttr("alt", node.alt ?? "", pos)];
        if (node.title) attrs.push(stringAttr("title", node.title, pos));
        return el("markdown-image", [], pos, end, attrs);
      }
      return markdownLiteral(source, pos, end);
    case "definition":
    case "footnoteDefinition":
    case "footnoteReference":
    case "linkReference":
    case "imageReference":
    case "html":
      return markdownLiteral(source, pos, end);
    default:
      return null;
  }
}

export function markdownLiteral(value: string, pos: number, end: number): DilElementNode {
  return el("markdown-literal", [{ type: "text", value, pos, raw: true }], pos, end);
}

export function isHttpsImageUrl(value: string): boolean {
  return /^https:\/\//i.test(value) && URL.canParse(value);
}

function plainText(children: readonly RootContent[] | undefined): string {
  if (!children) return "";
  let out = "";
  for (const child of children) {
    if (child.type === "text" || child.type === "html") out += child.value;
    else if (child.type === "inlineCode") out += `\`${child.value}\``;
    else out += plainText(phrasingOf(child));
  }
  return out;
}

function spanOf(
  node: { position?: { start?: { offset?: number }; end?: { offset?: number } } },
  prose: ProseMap,
): { pos: number; end: number } {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  const pos = prose.toOriginal(start ?? 0);
  return { pos, end: prose.toOriginal(end ?? start ?? 0) };
}

function el(name: string, children: DilNode[], pos: number, end: number, attrs: DilAttribute[] = []): DilElementNode {
  return { type: "element", name, attrs, children, pos, end, closed: true, synthetic: true };
}

function stringAttr(name: string, value: string, pos: number): DilAttribute {
  return { name, kind: "string", value, pos };
}

function booleanAttr(name: string, pos: number): DilAttribute {
  return { name, kind: "boolean", value: true, pos };
}

function firstWord(value: string): string {
  return value.split(/[\s{]/)[0] ?? value;
}
