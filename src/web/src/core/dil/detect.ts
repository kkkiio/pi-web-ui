/**
 * "Is this answer actually DIL?"
 *
 * Tests and evals distinguish authored DIL from Markdown lowering. Lowering marks
 * every element it synthesizes from Markdown with `synthetic: true`, and control
 * flow / interpolations only ever come from source DIL — so "any non-synthetic element,
 * or any `{#each}` / `{#if}` / `{expr}`" is exactly "the model wrote DIL".
 *
 * A fenced block never counts: its content is raw text, and a code sample that happens to
 * contain `<box>` must keep rendering as a code block.
 */

import type { DilNode } from "./types.ts";

export function hasDilElements(nodes: readonly DilNode[]): boolean {
  return nodes.some((node) => {
    switch (node.type) {
      case "element":
        return node.synthetic !== true || hasDilElements(node.children);
      case "expr":
      case "if":
      case "each":
      case "stmt":
        return true;
      default:
        return false;
    }
  });
}
