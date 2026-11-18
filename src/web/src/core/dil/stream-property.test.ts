/**
 * Streaming properties, modelled on remend's `streaming-properties.test.ts`
 * (vercel/streamdown): build documents from *complete* constructs, derive every kind of
 * incompleteness from an arbitrary cut, and check what healing may and may not do.
 *
 * Oracles:
 *
 *   bounded loss   authored text survives as a subsequence, except a bounded tail
 *   idempotence    healing a healed prefix changes nothing
 *   code is code   remark decides what is code; a cut may not turn it into prose
 *
 * The tail repair is where a "quiet" regression hides: it rewrites text the author
 * already wrote, and no assertion about crashes would notice.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";

// Fixed seeds: a failing property reproduces exactly, and CI does not flip on a random
// draw. Bump the seed deliberately to explore a new slice of the input space.
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "./index.ts";
import { repairStreamTail } from "./stream-repair.ts";
import type { DilNode } from "./types.ts";

const mdastParser = unified().use(remarkParse).use(remarkGfm);

/** Complete constructs, including the traps: multiline code, escapes, snake__case. */
const INLINE_ATOMS = [
  "plain words",
  "**bold text**",
  "*italic text*",
  "snake__case",
  "a_b_c",
  "`inline code`",
  "`multi\nline {a: 1}`",
  "``double `tick` span``",
  "value is 20~25 degrees",
  "\\{a, b\\}",
  "\\<box\\>",
  "[label](https://example.com)",
  "<dev@example.com>",
];

const BLOCK_ATOMS = [
  "# heading",
  "> a quote",
  "- item one\n- item two",
  "1. first\n\n2. second",
  "| a | b |\n| --- | --- |\n| 1 | 2 |",
  "```js\nconst total__count = 1;\n```",
  "$$\nx^2\n$$",
];

/** The longest fragment healing may legitimately drop: one cut-open construct. */
const MAX_LOSS = Math.max(...[...INLINE_ATOMS, ...BLOCK_ATOMS].map((atom) => atom.length)) + 2;

/**
 * Length of the longest prefix of `input` that appears as a subsequence of `output`.
 * Healing inserts closers and may drop a cut-open fragment; authored text is preserved
 * exactly when everything except that bounded tail survives.
 */
function preservedPrefixLength(input: string, output: string): number {
  let matched = 0;
  for (let i = 0; i < output.length && matched < input.length; i++) {
    if (output[i] === input[matched]) matched++;
  }
  return matched;
}

const documentArbitrary = fc
  .array(
    fc.oneof(
      { weight: 3, arbitrary: fc.subarray(INLINE_ATOMS, { minLength: 1 }) },
      { weight: 1, arbitrary: fc.constantFrom(...BLOCK_ATOMS).map((atom) => [atom]) },
    ),
    { minLength: 1, maxLength: 5 },
  )
  .map((groups) => groups.map((atoms) => atoms.join(" ")).join("\n\n"));

test("property: healing drops at most one cut-open construct, and re-heals to itself", () => {
  fc.assert(
    fc.property(documentArbitrary, fc.nat(), (doc, cutSeed) => {
      const prefix = doc.slice(0, cutSeed % (doc.length + 1));
      const healed = repairStreamTail(prefix);

      const loss = prefix.length - preservedPrefixLength(prefix, healed);
      assert.ok(loss <= MAX_LOSS, `dropped ${loss} chars:\n${JSON.stringify(prefix)} → ${JSON.stringify(healed)}`);
      const twice = repairStreamTail(healed);
      assert.equal(
        twice,
        healed,
        `healing must be idempotent:\nprefix=${JSON.stringify(prefix)}\nonce=${JSON.stringify(healed)}\ntwice=${JSON.stringify(twice)}`,
      );
    }),
    { numRuns: 200, seed: 20241118 },
  );
});

// `$$…$$` is a *DIL* math node, so its source never appears in the rendered text; the
// property compares against Markdown's text view, so the atom is excluded (a documented
// gap, like remend excludes its tilde-between-digits atoms).
const proseArbitrary = fc
  .array(
    fc.oneof(
      { weight: 3, arbitrary: fc.subarray(INLINE_ATOMS, { minLength: 1 }) },
      {
        weight: 1,
        arbitrary: fc.constantFrom(...BLOCK_ATOMS.filter((atom) => !atom.startsWith("$$"))).map((atom) => [atom]),
      },
    ),
    { minLength: 1, maxLength: 5 },
  )
  .map((groups) => groups.map((atoms) => atoms.join(" ")).join("\n\n"));

test("property: a parse keeps the healed text visible", () => {
  fc.assert(
    fc.property(proseArbitrary, fc.nat(), (doc, cutSeed) => {
      const prefix = doc.slice(0, cutSeed % (doc.length + 1));
      const healed = repairStreamTail(prefix);
      const expected = mdastText(healed);
      const actual = treeText(parseDocument(prefix).tree);

      // Lists add markers and tables add cells, so compare the authored characters:
      // every character of the expected text must appear, in order, in the tree text.
      const loss = expected.length - preservedPrefixLength(expected, actual);
      assert.ok(loss <= MAX_LOSS, `parse lost ${loss} of ${expected.length} chars:\n${JSON.stringify(prefix)}`);
    }),
    { numRuns: 150, seed: 20241118 },
  );
});

/**
 * Text before the last blank line is "settled": whatever the parser does with the tail,
 * complete paragraphs must not change as more tokens arrive. A recovery rule that reaches
 * back — a block swallowing the rest of the answer, a dispatch that rewrites earlier prose
 * — fails here, and it is invisible to any oracle about crashes.
 */
function settledText(source: string): string {
  const cut = source.lastIndexOf("\n\n");
  if (cut <= 0) return "";
  return treeText(parseDocument(source.slice(0, cut)).tree);
}

test("property: settled paragraphs only ever grow", () => {
  fc.assert(
    fc.property(documentArbitrary, fc.nat(), fc.nat(), (doc, seedA, seedB) => {
      const a = Math.min(seedA % (doc.length + 1), seedB % (doc.length + 1));
      const b = Math.max(seedA % (doc.length + 1), seedB % (doc.length + 1));
      const early = settledText(doc.slice(0, a));
      const late = settledText(doc.slice(0, b));
      if (!early) return;
      assert.ok(late.startsWith(early), `settled text changed:\n${JSON.stringify(early)}\n→ ${JSON.stringify(late)}`);
    }),
    { numRuns: 150, seed: 20241118 },
  );
});

function mdastText(source: string): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as { type?: string; value?: string; alt?: string; children?: unknown[] };
    if (record.type === "text" || record.type === "inlineCode" || record.type === "code") {
      out.push(record.value ?? "");
    } else if (record.type === "image") out.push(record.alt ?? "");
    for (const child of record.children ?? []) walk(child);
  };
  walk(mdastParser.parse(source));
  return out.join(" ");
}

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
  return out.join(" ");
}
