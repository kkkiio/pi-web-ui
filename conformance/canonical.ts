/**
 * Canonical projections, so two different implementations can be diffed.
 *
 * The reference renders its own component catalog and we render ours; comparing props in
 * general would compare two design systems. What is comparable is what a user can observe
 * and what the product depends on:
 *
 *   - the **structure** (tag nesting) of the tags both sides claim to render;
 *   - the **text** every node contributes;
 *   - for interactive controls, the **state-carrying props** (`value`, `direction`,
 *     `placeholder`, `rows`, `block`, `color`, `size`) — the `#48` surface;
 *   - **host effects** (`GenUI.issueNewTurn` arguments), verbatim;
 *   - the **state record** (`view_state` keys and values).
 *
 * Everything a side cannot render (the reference's `Cite`/`Entity`/`AsyncImage` hosts) is
 * dropped from both sides and reported as *skipped* rather than silently ignored.
 */

import type { ResolvedNode } from "../src/web/src/components/dil/resolve.ts";
import type { DilNode } from "../src/web/src/core/dil/types.ts";
import type { ReferenceNode } from "./reference.ts";

/**
 * Tags one side resolves through its client and the other renders inline: dropped, and
 * counted.
 *
 * The reference hands rich leaves to client widgets (`__chatgptClientDefinedWidget` with an
 * `invocationId`), so a captured program never shows what a code block or a formula looked
 * like — both sides are recorded as *not comparable* rather than as agreement.
 */
export const UNCOMPARED_TAGS: ReadonlySet<string> = new Set([
  "Cite",
  "Link",
  "Entity",
  "AsyncImage",
  "AsyncImageGroup",
  "__chatgptClientDefinedWidget",
  "code-block",
  "CodeBlock",
  "math",
]);

/** The props that carry observable state or layout intent on the interactive controls. */
export const COMPARABLE_PROPS: Readonly<Record<string, readonly string[]>> = {
  "radio-group": ["value", "direction"],
  radio: ["value"],
  textarea: ["value", "placeholder", "rows"],
  button: ["block", "color", "size"],
};

/** A canonical node: `tag[props]{children}` plus text runs. */
export type CanonNode =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "element";
      readonly tag: string;
      readonly props: Readonly<Record<string, unknown>>;
      readonly children: readonly CanonNode[];
    };

export interface CanonicalTree {
  readonly nodes: readonly CanonNode[];
  /** Tags dropped because the other side has no counterpart, with how often. */
  readonly skipped: Readonly<Record<string, number>>;
}

export function canonicalizeReference(nodes: readonly ReferenceNode[]): CanonicalTree {
  const skipped: Record<string, number> = {};
  const walk = (input: readonly ReferenceNode[]): CanonNode[] => {
    const out: CanonNode[] = [];
    for (const node of input) {
      if (node.kind === "text") {
        out.push({ kind: "text", value: normalizeText(node.value) });
        continue;
      }
      if (UNCOMPARED_TAGS.has(node.tag)) {
        skipped[node.tag] = (skipped[node.tag] ?? 0) + 1;
        continue;
      }
      out.push({
        kind: "element",
        tag: node.tag,
        props: pickProps(node.tag, node.props),
        children: walk(node.children),
      });
    }
    return compact(out);
  };
  return { nodes: walk(nodes), skipped };
}

export function canonicalizeResolved(nodes: readonly ResolvedNode[]): CanonicalTree {
  const skipped: Record<string, number> = {};
  const walk = (input: readonly ResolvedNode[]): CanonNode[] => {
    const out: CanonNode[] = [];
    for (const node of input) {
      if (node.kind === "text") {
        out.push({ kind: "text", value: normalizeText(node.value) });
        continue;
      }
      if (UNCOMPARED_TAGS.has(node.name)) {
        skipped[node.name] = (skipped[node.name] ?? 0) + 1;
        continue;
      }
      out.push({
        kind: "element",
        tag: node.name,
        props: pickProps(node.name, node.props),
        children: walk(node.children),
      });
    }
    return compact(out);
  };
  return { nodes: walk(nodes), skipped };
}

function pickProps(tag: string, props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const names = COMPARABLE_PROPS[tag];
  if (!names) return {};
  const picked: Record<string, unknown> = {};
  for (const name of names) {
    if (props[name] !== undefined) picked[name] = props[name];
  }
  return picked;
}

/** Markdown and the two implementations differ in incidental whitespace; the words match. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Drop nodes that contribute neither text nor structure, and unwrap the typography
 * `text` box: both sides wrap prose differently (`<text>` from the model's markup, ours
 * from Markdown lowering), and the wrapper carries no comparable prop. What remains is
 * the comparable projection — text content plus control structure.
 */
function compact(nodes: CanonNode[]): CanonNode[] {
  const out: CanonNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      if (node.value) out.push(node);
      continue;
    }
    const children = compact([...node.children]);
    if (node.tag === "text" && Object.keys(node.props).length === 0) {
      out.push(...children);
      continue;
    }
    if (children.length === 0 && Object.keys(node.props).length === 0) continue;
    out.push({ ...node, children });
  }
  return out;
}

/** A stable, human-readable rendering of a canonical tree, for a readable failure diff. */
export function formatTree(tree: CanonicalTree, indent = ""): string {
  const lines: string[] = [];
  for (const node of tree.nodes) {
    if (node.kind === "text") {
      lines.push(`${indent}"${node.value}"`);
      continue;
    }
    const props = Object.entries(node.props)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join(" ");
    lines.push(`${indent}<${node.tag}${props ? ` ${props}` : ""}>`);
    lines.push(formatTree({ nodes: node.children, skipped: {} }, `${indent}  `));
  }
  return lines.filter(Boolean).join("\n");
}

/** Every leaf path of a canonical tree, so a failure can name where the two sides part. */
export function signatures(tree: CanonicalTree): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly CanonNode[], path: string): void => {
    nodes.forEach((node, index) => {
      const here = `${path}/${index}`;
      if (node.kind === "text") {
        out.push(`${here} text "${node.value}"`);
        return;
      }
      const props = Object.entries(node.props)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join(",");
      out.push(`${here} <${node.tag}${props ? ` ${props}` : ""}>`);
      walk(node.children, here);
    });
  };
  walk(tree.nodes, "");
  return out;
}

/** The first line where the two trees differ, or `null` when they agree. */
export function firstDifference(left: readonly string[], right: readonly string[]): string | null {
  const limit = Math.max(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      const a = left[index] ?? "<end>";
      const b = right[index] ?? "<end>";
      return `line ${index + 1}\n  reference: ${a}\n  ours:      ${b}`;
    }
  }
  return null;
}

/** The `{#if}` / `{#each}`-expanded tree the renderer walks, for reference. */
export type { DilNode };
