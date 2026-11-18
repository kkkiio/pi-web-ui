/**
 * Streaming property: every prefix of a document parses, and complete paragraphs never
 * change while the tail grows.
 *
 * Deterministic and dependency-free: the fixtures are small, so this walks real prefixes
 * instead of sampling characters. The "complete paragraphs" clause is the useful half —
 * it is what catches a recovery rule that reaches back and rewrites earlier content.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./index.ts";
import type { DilNode } from "./types.ts";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__");

function treeText(nodes: readonly DilNode[]): string {
  const out: string[] = [];
  const walk = (list: readonly DilNode[]): void => {
    for (const node of list) {
      if (node.type === "text") out.push(node.value);
      else if (node.type === "element") walk(node.children);
      else if (node.type === "each") walk(node.body);
      else if (node.type === "if") for (const branch of node.branches) walk(branch.body);
    }
  };
  walk(nodes);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Text of the paragraphs that are already complete: everything before the last blank line. */
function settledText(source: string): string | null {
  const cut = source.lastIndexOf("\n\n");
  if (cut <= 0) return null;
  return treeText(parseDocument(source.slice(0, cut)).tree);
}

const sources = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".md"))
  .map((file) => ({ file, source: readFileSync(join(FIXTURES, file), "utf8") }));

test("every prefix parses without throwing", () => {
  for (const { file, source } of sources) {
    for (let end = 0; end <= source.length; end++) {
      const document = parseDocument(source.slice(0, end));
      assert.ok(document.diagnosticSummary.length > 0, `${file}: empty summary at ${end}`);
      assert.ok(!document.diagnosticSummary.includes("internal"), `${file}: internal error at ${end}`);
    }
  }
});

test("a completed paragraph keeps its text while the tail streams", () => {
  for (const { file, source } of sources) {
    let previous: string | null = null;
    for (let end = 1; end <= source.length; end++) {
      const settled = settledText(source.slice(0, end));
      if (settled === null) continue;
      if (previous !== null && settled.length >= previous.length) {
        assert.ok(
          settled.startsWith(previous),
          `${file}: a completed paragraph changed at ${end}\nbefore: ${previous}\nafter:  ${settled}`,
        );
      }
      if (previous === null || settled.length >= previous.length) previous = settled;
    }
  }
});
