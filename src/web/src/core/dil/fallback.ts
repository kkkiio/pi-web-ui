/**
 * Plain-text projection: the AST back to Markdown.
 *
 * Two callers need it: "Copy as Markdown" on an assistant message, and transcript
 * quoting (`Add to Chat`), both of which must keep working when the same content is
 * also rendered as UI. Nothing is evaluated — dynamic interpolations disappear and the
 * first branch of an `{#if}` stands in for the whole conditional, which is what a
 * reader without a renderer can still make sense of.
 */

import type { DilElementNode, DilNode } from "./types.ts";

interface RenderContext {
  readonly listDepth: number;
}

export function toFallbackMarkdown(nodes: DilNode[]): string {
  return tidyFallback(renderNodes(nodes, { listDepth: 0 }));
}

function renderNodes(nodes: DilNode[], ctx: RenderContext): string {
  let out = "";
  let previousWasTextBlock = false;
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.value;
        break;
      case "stmt":
      case "expr":
        break;
      case "fence":
        out +=
          node.kind === "math" ? `\n\n$$\n${node.value}\n$$\n\n` : `\n\n\`\`\`${node.info}\n${node.value}\n\`\`\`\n\n`;
        break;
      case "if":
        out += renderNodes(node.branches[0]?.body ?? [], ctx);
        break;
      case "each":
        out += renderNodes(node.body, ctx);
        break;
      case "element": {
        // Consecutive <text> siblings are paragraphs: keep them apart on the way back.
        const isTextBlock = node.name === "text";
        if (isTextBlock && previousWasTextBlock) out += "\n\n";
        out += renderElement(node, ctx);
        previousWasTextBlock = isTextBlock;
        break;
      }
    }
    if (node.type !== "element" || node.name !== "text") previousWasTextBlock = false;
  }
  return out;
}

function renderElement(node: DilElementNode, ctx: RenderContext): string {
  const inner = (): string => renderNodes(node.children, ctx).trim();

  switch (node.name) {
    case "title": {
      // size roughly remembers the heading level the Markdown lowering saw.
      const size = attributeValue(node, "size");
      const level = size === "xl" || size === "2xl" ? "#" : size === "lg" ? "##" : "###";
      return `\n\n${level} ${inner()}\n\n`;
    }
    case "text":
      return hasAttribute(node, "lineThrough") ? `~~${inner()}~~` : inner();
    case "caption":
      return inner() ? `\n${inner()}\n` : "";
    case "bold":
      return `**${inner()}**`;
    case "italic":
      return `*${inner()}*`;
    case "code": {
      const text = rawText(node);
      return text ? `\`${text}\`` : "";
    }
    case "math": {
      const value = attributeValue(node, "value") ?? inner();
      if (!value) return "";
      return hasAttribute(node, "block") ? `\n\n$$\n${value}\n$$\n\n` : `$${value}$`;
    }
    case "code-block": {
      const language = attributeValue(node, "language") ?? "";
      return `\n\n\`\`\`${language}\n${rawText(node)}\n\`\`\`\n\n`;
    }
    case "divider":
      return "\n\n---\n\n";
    case "blockquote": {
      const body = inner();
      if (!body) return "";
      return `\n\n${body
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n")}\n\n`;
    }
    case "list":
      return renderList(node, ctx);
    case "list-item":
      return renderNodes(node.children, { listDepth: ctx.listDepth + 1 }).trim();
    case "table":
      return renderTable(node, ctx);
    case "table-cell":
    case "table-row":
      return inner();
    case "Link": {
      const url = attributeValue(node, "url") ?? "";
      const title = attributeValue(node, "title");
      const label = inner() || url;
      return `[${label}](${url}${title ? ` "${title}"` : ""})`;
    }
    case "badge":
      return inner() ? ` ${inner()} ` : "";
    case "button":
      return inner() ? `[${inner()}]` : "";
    case "icon":
    case "svg":
    case "defs":
    case "marker":
    case "rect":
    case "path":
    case "line":
    case "circle":
      return "";
    case "box":
    case "row":
    case "col":
    case "grid":
    case "grid-item": {
      const body = node.children
        .map((child) => renderNodes([child], ctx).trim())
        .filter(Boolean)
        .join("\n\n");
      return body ? `\n\n${body}\n\n` : "";
    }
    default:
      return inner();
  }
}

/** `{#each}` / `{#if}` around the items are transparent for projection purposes. */
function collectItems(nodes: readonly DilNode[]): DilElementNode[] {
  const out: DilElementNode[] = [];
  for (const node of nodes) {
    if (node.type === "element" && node.name === "list-item") out.push(node);
    else if (node.type === "each") out.push(...collectItems(node.body));
    else if (node.type === "if") {
      for (const branch of node.branches) out.push(...collectItems(branch.body));
    }
  }
  return out;
}

function renderList(node: DilElementNode, ctx: RenderContext): string {
  const marker = attributeValue(node, "marker");
  const items = collectItems(node.children);
  if (!items.length) return renderNodes(node.children, ctx);

  const indent = "  ".repeat(ctx.listDepth);
  const start = Number.parseInt(attributeValue(node, "start") ?? "1", 10);
  const lines = items.map((item, index) => {
    const bullet = marker === "number" ? `${Number.isFinite(start) ? start + index : index + 1}.` : "-";
    const body = renderNodes(item.children, { listDepth: ctx.listDepth + 1 })
      .trim()
      .split("\n")
      .filter((line, lineIndex, all) => line.length > 0 || lineIndex < all.length - 1);
    const [first = "", ...rest] = body;
    const continuation = rest.map((line) => `\n${indent}  ${line}`).join("");
    return `${indent}${bullet} ${first}${continuation}`;
  });

  return `\n\n${lines.join("\n")}\n\n`;
}

function renderTable(node: DilElementNode, ctx: RenderContext): string {
  const rows = node.children.filter(
    (child): child is DilElementNode => child.type === "element" && child.name === "table-row",
  );
  if (!rows.length) return "";

  const rendered = rows.map((row) => {
    const cells = row.children
      .filter((child): child is DilElementNode => child.type === "element" && child.name === "table-cell")
      .map((cell) =>
        renderNodes(cell.children, ctx)
          .trim()
          .replace(/\s*\n\s*/g, " ")
          .replace(/\|/g, "\\|"),
      );
    return `| ${cells.join(" | ")} |`;
  });

  const columns = Math.max(1, rendered[0].split("|").length - 2);
  rendered.splice(1, 0, `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`);
  return `\n\n${rendered.join("\n")}\n\n`;
}

function rawText(node: DilElementNode): string {
  return node.children.map((child) => (child.type === "text" ? child.value : "")).join("");
}

function attributeValue(node: DilElementNode, name: string): string | null {
  const attribute = node.attrs.find((candidate) => candidate.name === name);
  if (!attribute) return null;
  if (typeof attribute.value === "string") return attribute.value;
  return attribute.value ? "true" : null;
}

function hasAttribute(node: DilElementNode, name: string): boolean {
  return node.attrs.some((attribute) => attribute.name === name);
}

/**
 * Drop projection debris — headings whose content was dynamic, table rows of empty
 * cells — without touching fenced blocks, where every line matters.
 */
export function tidyFallback(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    if (fence) {
      kept.push(line);
      if (line.trim() === fence) fence = null;
      continue;
    }
    const opener = /^\s*(```|~~~)/.exec(line);
    if (opener) {
      fence = opener[1];
      kept.push(line);
      continue;
    }
    if (!line.trim()) {
      kept.push("");
      continue;
    }
    if (/^\s*(\$\$|\\\[|\\\])\s*$/.test(line)) {
      kept.push(line.trim()); // math delimiters are structural, not debris
      continue;
    }
    if (/^#{1,6}\s*$/.test(line)) continue;
    if (/^#{1,6}\s/.test(line) && !hasWord(line.replace(/^#+\s*/, ""))) continue;
    if (line.startsWith("|")) {
      if (isTableSeparator(line)) {
        kept.push(line);
        continue;
      }
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
      if (cells.some(hasWord)) kept.push(line);
      continue;
    }
    if (!hasWord(line) && !/^[-*]\s/.test(line) && line.trim() !== "---") continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function isTableSeparator(line: string): boolean {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{1,}:?\s*$/.test(cell));
}

function hasWord(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}
