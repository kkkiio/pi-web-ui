import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./index.ts";
import type { DilDocument, DilElementNode, DilNode } from "./types.ts";

/**
 * Scenario fixtures. Each one is a small, realistic assistant answer covering one part
 * of the grammar, so its snapshot stays short enough to review:
 *
 *   prose-blocks     document-tier Markdown (headings, table, quote, list, math, code)
 *   layout-metrics   box / row / grid / grid-item, typography, interpolation
 *   inline-flow      element-interior InlineRun (bold/italic/code/strike, blank lines)
 *   control-flow     {@body} state, {#each} with index, {#if}/{:else}, button
 *   svg-grid         parametric SVG: nested {#each}, arithmetic attrs, defs/marker
 *   streaming-cut    a document truncated mid-tag: the recovery path
 */
const fixtureDir = fileURLToPath(new URL("./__fixtures__", import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, `${name}.dil.md`), "utf8");
}

function fixtures(): string[] {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".dil.md"))
    .map((name) => name.replace(/\.dil\.md$/, ""))
    .sort();
}

function walk(nodes: readonly DilNode[], visit: (node: DilNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.type === "element") walk(node.children, visit);
    else if (node.type === "if") for (const branch of node.branches) walk(branch.body, visit);
    else if (node.type === "each") walk(node.body, visit);
  }
}

function elementsIn(nodes: readonly DilNode[], name: string): DilElementNode[] {
  const found: DilElementNode[] = [];
  walk(nodes, (node) => {
    if (node.type === "element" && node.name === name) found.push(node);
  });
  return found;
}

function elementNames(document: DilDocument): Set<string> {
  const names = new Set<string>();
  walk(document.tree, (node) => {
    if (node.type === "element") names.add(node.name);
  });
  return names;
}

test("every scenario fixture parses clean", () => {
  for (const name of fixtures()) {
    if (name === "streaming-cut") continue;
    const document = parseDocument(fixture(name));
    assert.equal(document.diagnosticSummary, "clean", `${name}: ${document.diagnosticSummary}`);
  }
});

test("the fixtures together exercise the Phase 1 vocabulary", () => {
  const names = new Set<string>();
  for (const name of fixtures()) {
    for (const tag of elementNames(parseDocument(fixture(name)))) names.add(tag);
  }

  for (const tag of [
    "title",
    "text",
    "caption",
    "badge",
    "icon",
    "bold",
    "italic",
    "code",
    "math",
    "Link",
    "box",
    "row",
    "grid",
    "grid-item",
    "list",
    "list-item",
    "table",
    "table-row",
    "table-cell",
    "blockquote",
    "divider",
    "code-block",
    "button",
    "svg",
    "defs",
    "marker",
    "rect",
    "path",
    "line",
  ]) {
    assert.ok(names.has(tag), `expected a <${tag}> in some fixture`);
  }
});

test("lowered prose keeps no stray markdown syntax", () => {
  const leftovers: string[] = [];
  for (const name of fixtures()) {
    walk(parseDocument(fixture(name)).tree, (node) => {
      if (node.type !== "text" || node.raw) return;
      if (/\*\*|(^|\n)\s*[-*+]\s|\]\(|^#{1,6}\s/.test(node.value)) leftovers.push(`${name}: ${node.value}`);
    });
  }
  assert.deepEqual(leftovers, []);
});

test("every prefix of every fixture parses without throwing", () => {
  for (const name of fixtures()) {
    const source = fixture(name);
    for (let length = 1; length <= source.length; length += 13) {
      const document = parseDocument(source.slice(0, length));
      assert.ok(Array.isArray(document.tree), `${name} prefix ${length}`);
      for (const diagnostic of document.diagnostics) {
        assert.ok(Number.isInteger(diagnostic.line) && diagnostic.line > 0, `${name} prefix ${length}`);
        assert.ok(Number.isInteger(diagnostic.column) && diagnostic.column > 0, `${name} prefix ${length}`);
      }
    }
  }
});

test("a document cut mid-tag is recovered, not thrown away", () => {
  const document = parseDocument(fixture("streaming-cut"));
  const codes = new Set(document.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(codes.has("unterminated_tag"), document.diagnosticSummary);
  assert.ok(codes.has("unclosed_tag"), document.diagnosticSummary);

  const box = elementsIn(document.tree, "box")[0];
  assert.ok(box, "the half-parsed container is still rendered");
  assert.equal(box.closed, false);
  assert.equal(elementsIn(document.tree, "title")[0].children.length > 0, true);
  // The half-written <text size="sm was dropped rather than rendered.
  assert.equal(elementsIn(document.tree, "text").length, 0);
});

test("parsing is deterministic", () => {
  for (const name of fixtures()) {
    const source = fixture(name);
    assert.equal(JSON.stringify(parseDocument(source)), JSON.stringify(parseDocument(source)), name);
  }
});

test("a real ChatGPT DIL corpus parses when DIL_CORPUS_DIR is set", (t) => {
  const directory = process.env.DIL_CORPUS_DIR;
  if (!directory) {
    t.skip("set DIL_CORPUS_DIR=/path/to/dil-samples to run against real samples");
    return;
  }

  // `.dil.md` is the convention for a standalone DIL case; captures from the research
  // corpus still use `.source.md`, so both are accepted.
  const files = readdirSync(directory).filter((file) => /\.dil\.md$|\.source\.md$/.test(file));
  assert.ok(files.length > 0, `no *.dil.md under ${directory}`);

  const dirty: string[] = [];
  for (const file of files) {
    const document = parseDocument(readFileSync(join(directory, file), "utf8"));
    if (document.diagnosticSummary !== "clean") dirty.push(`${file}: ${document.diagnosticSummary}`);
  }
  // Truncated captures and malformed samples legitimately report diagnostics; what must
  // never happen is a throw or a lost document, so the check is on the ratio.
  assert.ok(dirty.length <= Math.max(1, Math.floor(files.length * 0.1)), dirty.join("\n"));
});
