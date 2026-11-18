/**
 * The prompt's examples are fixtures.
 *
 * Models copy what they see, so a malformed example teaches malformed DIL. Parsing both
 * examples keeps that from shipping, and checking the shapes against the prompt's own
 * vocabulary keeps the two halves from drifting apart.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNodes } from "../src/web/src/components/dil/resolve.ts";
import { parseDocument } from "../src/web/src/core/dil/index.ts";
import type { DilNode } from "../src/web/src/core/dil/types.ts";
import { DIL_EXAMPLE_SVG, DIL_PROMPT_EXAMPLES, DIL_SYSTEM_PROMPT } from "./dil-system-prompt.ts";

function tags(tree: readonly DilNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly DilNode[]) => {
    for (const node of nodes) {
      if (node.type === "element") {
        out.push(node.name);
        walk(node.children);
      } else if (node.type === "each") {
        walk(node.body);
      } else if (node.type === "if") {
        for (const branch of node.branches) walk(branch.body);
      }
    }
  };
  walk(tree);
  return out;
}

function hasControlFlow(nodes: readonly DilNode[], type: "each" | "if"): boolean {
  return nodes.some((node) => {
    if (node.type === type) return true;
    if (node.type === "element") return hasControlFlow(node.children, type);
    if (node.type === "each") return hasControlFlow(node.body, type);
    if (node.type === "if") return node.branches.some((branch) => hasControlFlow(branch.body, type));
    return false;
  });
}

function attributeKinds(source: string): string[] {
  const kinds: string[] = [];
  const walk = (nodes: readonly DilNode[]) => {
    for (const node of nodes) {
      if (node.type === "element") {
        for (const attribute of node.attrs) kinds.push(`${attribute.name}:${attribute.kind}`);
        walk(node.children);
      } else if (node.type === "each") {
        walk(node.body);
      } else if (node.type === "if") {
        for (const branch of node.branches) walk(branch.body);
      }
    }
  };
  walk(parseDocument(source).tree);
  return kinds;
}

function hasNestedElement(nodes: readonly DilNode[]): boolean {
  return nodes.some((node) => {
    if (node.type !== "element") return false;
    return node.children.some((child) => child.type === "element") || hasNestedElement(node.children);
  });
}

test("every prompt example parses without diagnostics", () => {
  for (const [name, source] of Object.entries(DIL_PROMPT_EXAMPLES)) {
    const document = parseDocument(source);
    assert.deepEqual(
      document.diagnostics.map((d) => `${d.code}: ${d.message}`),
      [],
      `${name} example must parse cleanly`,
    );
  }
});

test("the proportions example shows a repeated row with proportional bars", () => {
  const document = parseDocument(DIL_PROMPT_EXAMPLES.proportions);
  const names = tags(document.tree);
  for (const tag of ["box", "row", "caption", "text"]) assert.ok(names.includes(tag), `missing <${tag}>`);
  assert.ok(hasControlFlow(document.tree, "each"), "needs {#each}");
  const kinds = attributeKinds(DIL_PROMPT_EXAMPLES.proportions);
  assert.ok(kinds.includes("width:expr"), "the bar width must be an expression");
  // Nesting is the point: a bar is a box inside a track box.
  assert.ok(hasNestedElement(document.tree), "needs a nested element");
});

test("the containment example shows a hop with an inner box, an arrow and a badge", () => {
  const document = parseDocument(DIL_PROMPT_EXAMPLES.containment);
  const names = tags(document.tree);
  for (const tag of ["box", "row", "badge", "icon", "title", "caption"]) {
    assert.ok(names.includes(tag), `missing <${tag}>`);
  }
  const kinds = attributeKinds(DIL_PROMPT_EXAMPLES.containment);
  assert.ok(
    kinds.some((kind) => kind.startsWith("name:")),
    "the icon needs a name attribute",
  );
  assert.ok(
    kinds.some((kind) => kind.startsWith("padding:expr")),
    "padding={{ x, y }} shows the object form",
  );
});

test("the svg example resolves to real geometry", () => {
  const document = parseDocument(DIL_EXAMPLE_SVG);
  const resolved = resolveNodes(document.tree, {});
  const counts = new Map<string, number>();
  const walk = (nodes: readonly ReturnType<typeof resolveNodes>[number][]) => {
    for (const node of nodes) {
      if (node.kind !== "element") continue;
      counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
      walk(node.children);
    }
  };
  walk(resolved);
  assert.equal(counts.get("rect"), 32, "4 rows × 8 columns");
  assert.equal(counts.get("line"), 1);
  assert.equal(counts.get("marker"), 1);
  assert.equal(counts.get("text"), 1);
});

test("the prompt embeds every example and names every tag they use", () => {
  for (const source of Object.values(DIL_PROMPT_EXAMPLES)) {
    assert.ok(DIL_SYSTEM_PROMPT.includes(source), "prompt must embed the example verbatim");
  }
  const used = new Set(Object.values(DIL_PROMPT_EXAMPLES).flatMap((source) => tags(parseDocument(source).tree)));
  for (const tag of used) {
    assert.ok(DIL_SYSTEM_PROMPT.includes(`<${tag}`), `prompt does not name <${tag}>`);
  }
});

test("shape comes before the reference tables", () => {
  // The examples are what the model imitates; the tag and value lists only resolve doubts
  // about spelling. Putting the tables first buries the shape under a vocabulary dump.
  const reference = DIL_SYSTEM_PROMPT.indexOf("Reference —");
  assert.ok(reference > 0, "the prompt needs a reference section");
  for (const [name, source] of Object.entries(DIL_PROMPT_EXAMPLES)) {
    assert.ok(DIL_SYSTEM_PROMPT.indexOf(source) < reference, `${name} example must come before the reference tables`);
  }
});

test("the prompt stays small enough to sit in every turn", () => {
  // The section is diffed into the system prompt once per activation; it must not grow
  // into a manual. 4000 characters is roughly 1k tokens.
  assert.ok(DIL_SYSTEM_PROMPT.length < 4000, `prompt is ${DIL_SYSTEM_PROMPT.length} characters`);
});
