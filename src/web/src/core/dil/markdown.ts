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
 *   element level   `InlineFlow`  **no** block Markdown at all: blank lines are the only
 *                                 paragraph separator, everything else is the InlineRun
 *                                 subset from `inline.ts` (`**bold**`, `*italic*`,
 *                                 `~~strike~~`, `` `code` ``, `$math$`, `[label](url)`).
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
 *   ![alt](src)             → literal `![alt](src)` (no image primitive in Phase 1)
 *
 * Inline DIL nodes (`math`, `Link`, `icon`, `badge`, `bold`, `italic`, `code`) and
 * `{expr}` interpolations stay inside the surrounding flow in both tiers, so
 * `公式 $E = mc^2$ 与…` keeps its spaces and its line.
 */

import type { Code, List, ListItem, PhrasingContent, RootContent, Table, TableRow } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isInlineTag, parseInline } from "./inline.ts";
import type { DilAttribute, DilElementNode, DilFenceNode, DilNode } from "./types.ts";

const HEADING_SIZE: Record<number, string> = { 1: "xl", 2: "lg", 3: "md", 4: "md", 5: "md", 6: "md" };

/**
 * One processor for the whole session: building it per prose run is the expensive part.
 * `codeIndented` is off — in DIL a four-space line is indentation, never a code block.
 */
const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .data("micromarkExtensions", [{ disable: { null: ["codeIndented"] } }]);

/** Which grammar tier the prose being lowered belongs to (`dil.ebnf` §1). */
export type ProseTier = "document" | "element";

export interface LowerOptions {
  /** `document` (default) or `element`. */
  readonly document?: boolean;
}

export function lowerMarkdown(nodes: DilNode[], options: LowerOptions = {}): DilNode[] {
  return lowerNodes(nodes, options.document === false ? "element" : "document");
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

function lowerNodes(nodes: DilNode[], tier: ProseTier): DilNode[] {
  return tier === "document" ? lowerDocumentProse(nodes) : lowerInlineFlow(nodes);
}

function lowerNode(node: DilNode, tier: ProseTier): DilNode {
  switch (node.type) {
    case "element":
      return node.synthetic ? node : { ...node, children: lowerNodes(node.children, "element") };
    case "if":
      return { ...node, branches: node.branches.map((branch) => ({ ...branch, body: lowerNodes(branch.body, tier) })) };
    case "each":
      return { ...node, body: lowerNodes(node.body, tier) };
    case "fence":
      return fenceToElement(node);
    default:
      return node;
  }
}

// ---------------------------------------------------------------------------
// Document tier — BlockProse (full GFM)
// ---------------------------------------------------------------------------

function lowerDocumentProse(nodes: DilNode[]): DilNode[] {
  const out: DilNode[] = [];
  let run: DilNode[] = [];

  const flushRun = (): void => {
    if (!run.length) return;
    // Inline nodes become placeholders, so CommonMark still sees one line and can
    // recognize `- <Link/>` as a list item; the nodes are substituted back afterwards.
    const prose = composeProse(run);
    // A run that is only layout whitespace carries no paragraph.
    if (!prose.nodes.length && !/\S/.test(prose.text)) return;
    out.push(...blockProse(prose));
    run = [];
  };

  for (const node of nodes) {
    if (node.type === "expr" || (node.type === "element" && isInlineTag(node.name))) {
      run.push(node);
      continue;
    }
    if (node.type === "text") {
      const pieces = node.value.split(/\n[ \t]*\n/);
      pieces.forEach((piece, index) => {
        if (index > 0) flushRun();
        if (/\S/.test(piece)) run.push({ ...node, value: piece });
      });
      continue;
    }
    flushRun();
    out.push(lowerNode(node, "document"));
  }
  flushRun();
  return out;
}

function blockProse(prose: CompositeProse): DilNode[] {
  return contentNodes(markdown.parse(prose.text).children, prose);
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
function composeProse(run: readonly DilNode[]): CompositeProse {
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
// Element tier — InlineFlow (no block Markdown)
// ---------------------------------------------------------------------------

/**
 * `InlineFlow ::= InlineRun ( BlankLine+ InlineRun )*`.
 *
 * A single run is emitted unwrapped, so `<row>数量：{n} 与 **两种**</row>` stays a flex
 * row of inline nodes; several runs (blank-line separated) each become one `<text>`.
 */
function lowerInlineFlow(nodes: DilNode[]): DilNode[] {
  const pieces: Array<{ readonly nodes: DilNode[] } | { readonly block: DilNode }> = [];
  let flow: DilNode[] = [];

  const flushFlow = (): void => {
    const trimmed = trimFlowEdges(flow);
    if (trimmed.length) pieces.push({ nodes: trimmed });
    flow = [];
  };

  for (const node of nodes) {
    if (node.type === "text") {
      if (node.raw) {
        flow.push(node);
        continue;
      }
      const runs = node.value.split(/\n[ \t]*\n/);
      runs.forEach((run, index) => {
        if (index > 0) flushFlow(); // BlankLine ends the paragraph
        if (run) flow.push({ ...node, value: run });
      });
      continue;
    }
    if (node.type === "expr" || (node.type === "element" && isInlineTag(node.name))) {
      flow.push(node);
      continue;
    }
    flushFlow();
    pieces.push({ block: lowerNode(node, "element") });
  }
  flushFlow();

  const flowCount = pieces.filter((piece) => "nodes" in piece).length;
  const out: DilNode[] = [];
  for (const piece of pieces) {
    if ("block" in piece) {
      out.push(piece.block);
      continue;
    }
    const children: DilNode[] = [];
    for (const node of piece.nodes) {
      if (node.type === "text") children.push(...parseInline(node.value, node.pos));
      else children.push(lowerNode(node, "element"));
    }
    if (!children.length) continue;
    if (flowCount > 1) {
      const pos = piece.nodes[0].pos;
      out.push(el("text", children, pos, pos));
    } else {
      out.push(...children);
    }
  }
  return out;
}

/** Leading indentation and trailing layout whitespace are XML formatting, not content. */
function trimFlowEdges(nodes: DilNode[]): DilNode[] {
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
      nodes[0] = { ...first, value: trimmed };
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
        ]),
      ];
    case "list":
      return [listElement(node, prose)];
    case "blockquote":
      return [el("blockquote", contentNodes(node.children, prose), pos, end)];
    case "thematicBreak":
      return [el("divider", [], pos, end)];
    case "code":
      return [codeBlockElement(node, pos, end)];
    case "table":
      return [tableElement(node, prose)];
    case "math":
      return [el("math", [], pos, end, [stringAttr("value", node.value, pos), booleanAttr("block", pos)])];
    case "html":
    case "yaml":
      // Markdown HTML blocks never come out of the DIL parser (a `<tag>` is an element);
      // front matter and stray markup stay literal.
      return node.value ? [{ type: "text", value: node.value, pos }] : [];
    case "definition":
      return [];
    case "footnoteDefinition":
      return contentNodes(node.children, prose);
    default:
      return [el("text", phrasingNodes(phrasingOf(node), prose), pos, end)];
  }
}

function phrasingOf(node: RootContent): PhrasingContent[] {
  const children = (node as { children?: PhrasingContent[] }).children;
  return Array.isArray(children) ? children : [];
}

function codeBlockElement(node: Code, pos: number, end: number): DilElementNode {
  const attrs = node.lang ? [stringAttr("language", firstWord(node.lang), pos)] : [];
  const children: DilNode[] = node.value ? [{ type: "text", value: node.value, pos, raw: true }] : [];
  return el("code-block", children, pos, end, attrs);
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
  const children = contentNodes(node.children, prose);

  // GFM task list: micromark strips `[x]`, so put the state back where a reader sees it.
  if (typeof node.checked === "boolean") {
    const marker = node.checked ? "☑ " : "☐ ";
    const first = children[0];
    if (first && first.type === "element" && first.name === "text") {
      children[0] = { ...first, children: [{ type: "text", value: marker, pos }, ...first.children] };
    } else {
      children.unshift({ type: "text", value: marker, pos });
    }
  }
  return el("list-item", children, pos, end);
}

function tableElement(node: Table, prose: CompositeProse): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  const rows = node.children.map((row, index) => tableRowElement(row, index === 0, prose));
  return el("table", rows, pos, end);
}

function tableRowElement(node: TableRow, header: boolean, prose: CompositeProse): DilElementNode {
  const { pos, end } = spanOf(node, prose);
  const cells = node.children.map((cell) => {
    const cellSpan = spanOf(cell, prose);
    const attrs = header ? [booleanAttr("header", cellSpan.pos)] : [];
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
        // No image primitive in Phase 1: keep the source so copy/quote stay faithful.
        out.push({ type: "text", value: imageSource(stripPlaceholders(child.alt ?? ""), child.url, child.title), pos });
        break;
      case "inlineMath":
        out.push(el("math", [], pos, end, [stringAttr("value", child.value, pos)]));
        break;
      case "break":
        out.push({ type: "text", value: "\n", pos });
        break;
      case "html":
        out.push({ type: "text", value: child.value, pos });
        break;
      case "footnoteReference":
        out.push({ type: "text", value: `[^${child.label ?? child.identifier}]`, pos });
        break;
      case "linkReference":
        out.push({
          type: "text",
          value: `[${stripPlaceholders(plainText(child.children))}][${child.label ?? child.identifier}]`,
          pos,
        });
        break;
      case "imageReference":
        out.push({
          type: "text",
          value: `![${stripPlaceholders(child.alt ?? "")}][${child.label ?? child.identifier}]`,
          pos,
        });
        break;
      default:
        out.push({ type: "text", value: stripPlaceholders(plainText(phrasingOf(child as RootContent))), pos });
        break;
    }
  }
  return out;
}

function imageSource(alt: string | null | undefined, url: string, title: string | null | undefined): string {
  return `![${alt ?? ""}](${url}${title ? ` "${title}"` : ""})`;
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

// ---------------------------------------------------------------------------
// Emphasis that spans an inline element
// ---------------------------------------------------------------------------

/**
 * `**<Link …/>**` cannot be resolved inside one text node: the structural parser
 * splits the run at `<`. Authors (and ChatGPT) still write it, so pair an unmatched
 * delimiter at the end of one text node with the opposite one at the start of a later
 * sibling — only across inline nodes, and only when no nested delimiter makes the
 * wrap ambiguous.
 *
 * Runs on the raw AST, before lowering, so document-level runs still are text nodes.
 */
export function resolveSpanningEmphasis(nodes: DilNode[]): DilNode[] {
  const out: DilNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== "text" || node.raw) {
      out.push(resolveChildEmphasis(node));
      continue;
    }

    const opener = /(\*\*|__|\*|_)$/.exec(node.value);
    if (!opener) {
      out.push(node);
      continue;
    }
    const delimiter = opener[1];
    const contentEnd = node.value.length - delimiter.length;
    if (node.value[contentEnd - 1] === delimiter[0]) {
      out.push(node);
      continue;
    }

    let close = -1;
    for (let j = i + 1; j < nodes.length; j++) {
      const candidate = nodes[j];
      if (candidate.type !== "text" || candidate.raw) continue;
      if (candidate.value.startsWith(delimiter)) close = j;
      break;
    }
    const inner = close < 0 ? [] : nodes.slice(i + 1, close);
    if (
      close < 0 ||
      !inner.length ||
      !inner.every(isInlineNode) ||
      inner.some((child) => child.type === "text" && child.value.includes(delimiter[0]))
    ) {
      out.push(node);
      continue;
    }

    const prefix = node.value.slice(0, contentEnd);
    if (prefix) out.push({ ...node, value: prefix });
    out.push({
      type: "element",
      name: delimiter.length === 2 ? "bold" : "italic",
      attrs: [],
      children: inner,
      pos: node.pos,
      end: node.pos,
      closed: true,
    });
    const closingNode = nodes[close] as { value: string; pos: number };
    const rest = closingNode.value.slice(delimiter.length);
    if (!rest) {
      i = close;
      continue;
    }
    nodes[close] = { ...closingNode, value: rest } as DilNode;
    i = close - 1; // the loop's `i++` re-processes the remainder as prose
  }

  return out;
}

function resolveChildEmphasis(node: DilNode): DilNode {
  if (node.type === "element") return { ...node, children: resolveSpanningEmphasis(node.children) };
  if (node.type === "if") {
    return {
      ...node,
      branches: node.branches.map((branch) => ({ ...branch, body: resolveSpanningEmphasis(branch.body) })),
    };
  }
  if (node.type === "each") return { ...node, body: resolveSpanningEmphasis(node.body) };
  return node;
}

/**
 * Block-level tags never join a prose run; everything else (inline DIL elements and
 * unknown host tags) is treated as inline.
 */
const BLOCK_LEVEL_TAGS: ReadonlySet<string> = new Set([
  "box",
  "row",
  "col",
  "column",
  "grid",
  "grid-item",
  "list",
  "list-item",
  "table",
  "table-row",
  "table-cell",
  "blockquote",
  "svg",
  "code-block",
  "pre",
  "divider",
  "title",
]);

function isInlineNode(node: DilNode): boolean {
  if (node.type === "text" || node.type === "expr") return true;
  if (node.type === "element") return !BLOCK_LEVEL_TAGS.has(node.name);
  return false;
}

// ---------------------------------------------------------------------------
// Synthetic node helpers
// ---------------------------------------------------------------------------

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
