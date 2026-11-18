/**
 * Post-parse pass: prune incomplete empty containers.
 *
 * While streaming, a container is opened before its children arrive:
 * `<box border radius="xl">` with nothing inside yet. Rendering that as an empty box
 * makes the transcript flash; the captured ChatGPT compiler drops it until the first
 * child shows up. Only containers are pruned — an unclosed empty `<text>` is harmless.
 */

import type { DilNode } from "./types.ts";

export const CONTAINER_TAGS: ReadonlySet<string> = new Set([
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
  "radio-group",
  "blockquote",
  "svg",
  "defs",
  "code-block",
  "pre",
]);

const hasContent = (children: readonly DilNode[]): boolean =>
  children.some((child) => child.type !== "text" || child.value.trim().length > 0);

export function pruneEmptyIncomplete(nodes: DilNode[]): DilNode[] {
  const out: DilNode[] = [];
  for (const node of nodes) {
    if (node.type === "element") {
      const children = pruneEmptyIncomplete(node.children);
      if (!node.closed && CONTAINER_TAGS.has(node.name) && !hasContent(children)) continue;
      out.push({ ...node, children });
      continue;
    }
    if (node.type === "if") {
      out.push({
        ...node,
        branches: node.branches.map((branch) => ({ ...branch, body: pruneEmptyIncomplete(branch.body) })),
      });
      continue;
    }
    if (node.type === "each") {
      out.push({ ...node, body: pruneEmptyIncomplete(node.body) });
      continue;
    }
    out.push(node);
  }
  return out;
}
