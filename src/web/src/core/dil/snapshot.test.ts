import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseDocument, toFallbackMarkdown } from "./index.ts";
import type { DilAttribute, DilDiagnostic, DilDocument, DilNode } from "./types.ts";

/**
 * Golden snapshots of the parse result — the reviewable artifact for this module.
 *
 * For every `__fixtures__/*.dil.md` we commit what the pipeline produced:
 *
 *   __snapshots__/<name>.tree.json      lowered render tree + state + diagnostics
 *   __snapshots__/<name>.fallback.md    the Markdown projection (readable as prose)
 *
 * The tree is written as a compact projection, not raw JSON of the AST:
 *
 *   "文字"                              a text run
 *   { "tag": "title", "attrs": { "size": "lg" }, "children": ["标题"] }
 *   { "attrs": { "gap": { "expr": "2" }, "border": true } }
 *   { "expr": "n" }                    an interpolation
 *   { "tag": "box", "closed": false }  a half-streamed container
 *
 * Offsets (`pos` / `end`) and internal flags (`synthetic`) are omitted — noise for
 * review; the tests below assert offset invariants separately.
 *
 *   npm run test:dil:update             regenerate after an intentional change
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "__fixtures__");
const snapshotDir = join(here, "__snapshots__");
const update = process.env.UPDATE_SNAPSHOTS === "1";

for (const file of readdirSync(fixtureDir)
  .filter((name) => name.endsWith(".dil.md"))
  .sort()) {
  const base = file.replace(/\.dil\.md$/, "");

  test(`pipeline snapshot: ${file}`, () => {
    const document = parseDocument(readFileSync(join(fixtureDir, file), "utf8"));

    compare(`${base}.tree.json`, `${renderJson(snapshotOf(document))}\n`);
    compare(`${base}.fallback.md`, `${toFallbackMarkdown(document.tree)}\n`);
  });

  test(`node offsets stay inside the source: ${file}`, () => {
    const source = readFileSync(join(fixtureDir, file), "utf8");
    const document = parseDocument(source);
    checkOffsets(document.tree, source.length);
  });
}

function snapshotOf(document: DilDocument): unknown {
  return {
    diagnosticSummary: document.diagnosticSummary,
    diagnostics: document.diagnostics.map(diagnosticSnapshot),
    tree: snapshotTree(document.tree),
  };
}

/**
 * JSON with a line budget: a subtree that fits one line stays on one line, so a table
 * row reads as one row instead of fourteen. The result is still valid JSON.
 */
const MAX_INLINE = 100;

function renderJson(value: unknown, indent = 0, column = indent): string {
  const flat = compactJson(value);
  if (column + flat.length <= MAX_INLINE) return flat;

  const inner = " ".repeat(indent + 2);
  const outer = " ".repeat(indent);
  if (Array.isArray(value)) {
    const items = value.map((item) => inner + renderJson(item, indent + 2, indent + 2));
    return `[\n${items.join(",\n")}\n${outer}]`;
  }
  if (value && typeof value === "object") {
    const items = Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      const prefix = `${inner}${JSON.stringify(key)}: `;
      return prefix + renderJson(child, indent + 2, prefix.length);
    });
    return `{\n${items.join(",\n")}\n${outer}}`;
  }
  return flat;
}

function compactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compactJson).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}: ${compactJson(child)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

function snapshotTree(nodes: readonly DilNode[]): unknown[] {
  return nodes.map(snapshotNode);
}

function snapshotNode(node: DilNode): unknown {
  switch (node.type) {
    case "text":
      return node.value;
    case "expr":
      return { expr: node.code };
    case "stmt":
      return { stmt: node.code };
    case "fence":
      return {
        fence: node.kind,
        ...(node.info ? { info: node.info } : {}),
        ...(node.closed ? {} : { closed: false }),
        value: node.value,
      };
    case "if":
      return {
        if: node.branches.map((branch) => ({
          ...(branch.cond === null ? { else: true } : { cond: branch.cond }),
          body: snapshotTree(branch.body),
        })),
      };
    case "each":
      return {
        each: {
          list: node.list,
          pattern: node.pattern,
          ...(node.index ? { index: node.index } : {}),
          body: snapshotTree(node.body),
        },
      };
    case "element":
      return {
        tag: node.name,
        ...(node.attrs.length
          ? { attrs: Object.fromEntries(node.attrs.map((attribute) => [attribute.name, snapshotAttribute(attribute)])) }
          : {}),
        ...(node.closed ? {} : { closed: false }),
        ...(node.children.length ? { children: snapshotTree(node.children) } : {}),
      };
  }
}

function snapshotAttribute(attribute: DilAttribute): unknown {
  if (attribute.kind === "boolean") return true;
  if (attribute.kind === "string") return attribute.value;
  return { [attribute.kind]: attribute.value };
}

function diagnosticSnapshot(diagnostic: DilDiagnostic): Record<string, unknown> {
  const { code, line, column, action, tag, expected, found } = diagnostic;
  return {
    code,
    line,
    column,
    ...(action ? { action } : {}),
    ...(tag ? { tag } : {}),
    ...(expected ? { expected } : {}),
    ...(found ? { found } : {}),
  };
}

function compare(name: string, actual: string): void {
  const path = join(snapshotDir, name);
  if (update) {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `missing snapshot ${name} — run npm run test:dil:update`);
  assert.equal(readFileSync(path, "utf8"), actual, `snapshot ${name} changed`);
}

function checkOffsets(nodes: readonly DilNode[], sourceLength: number): void {
  for (const node of nodes) {
    assert.ok(node.pos >= 0 && node.pos <= sourceLength, `${node.type} pos ${node.pos} out of range`);
    if (node.type === "element" || node.type === "fence") {
      assert.ok(node.end >= node.pos, `${node.type} end ${node.end} before pos ${node.pos}`);
      assert.ok(node.end <= sourceLength, `${node.type} end ${node.end} out of range`);
    }
    if (node.type === "element") checkOffsets(node.children, sourceLength);
    else if (node.type === "if") for (const branch of node.branches) checkOffsets(branch.body, sourceLength);
    else if (node.type === "each") checkOffsets(node.body, sourceLength);
  }
}
