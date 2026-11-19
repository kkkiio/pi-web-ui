/**
 * Vocabulary invariants.
 *
 * The tag table is the single source of truth for three consumers (run membership, prompt
 * text, renderer fallback routing), so its own properties are worth pinning: which tags are
 * inline atoms, and that every tag a model is told about is one we actually render.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { DIL_VOCABULARY, INLINE_TAGS, isInlineTag, KNOWN_TAGS, tagEntry } from "./vocabulary.ts";

test("inline atoms are exactly the tags an emphasis pair may wrap", () => {
  // `Cite`, `Entity`, `AsyncImage` and `AsyncImageGroup` are children of the surrounding
  // `<text>` in ChatGPT's compiler output, so they are inline atoms too.
  assert.deepEqual([...INLINE_TAGS].sort(), [
    "AsyncImage",
    "AsyncImageGroup",
    "Cite",
    "Entity",
    "Link",
    "badge",
    "bold",
    "code",
    "icon",
    "italic",
    "math",
  ]);
});

test("containers keep their position: a paragraph tag is never an inline atom", () => {
  for (const tag of ["text", "title", "caption", "box", "row", "grid", "list", "table", "svg", "divider"]) {
    assert.equal(isInlineTag(tag), false, `<${tag}> is a container`);
    assert.equal(tagEntry(tag)?.kind, "container", `<${tag}> must be declared a container`);
  }
});

test("support says what the renderer does with a tag", () => {
  // `rendered` is what the prompt may advertise; the rest renders as a fallback.
  assert.equal(tagEntry("box")?.support, "rendered");
  assert.equal(tagEntry("Cite")?.support, "fallback", "aligned with ChatGPT, renderer pending");
  assert.equal(tagEntry("Entity")?.support, "fallback");
  assert.equal(tagEntry("radio")?.support, "fallback", "#48 controls");
  assert.equal(tagEntry("__chatgptClientDefinedWidget")?.support, "internal");
});

test("SVG primitives are marked, because their tag names collide with typography", () => {
  // `<text>` is a paragraph container at document level and a primitive inside `<svg>`.
  assert.equal(tagEntry("text")?.svg, true);
  assert.equal(tagEntry("text")?.kind, "container");
  assert.equal(tagEntry("rect")?.svg, true);
  assert.equal(tagEntry("box")?.svg, undefined);
});

test("an unknown tag is neither inline nor known, so it keeps its place and falls back", () => {
  assert.equal(isInlineTag("my-widget"), false);
  assert.equal(tagEntry("my-widget"), undefined);
  assert.ok(KNOWN_TAGS.includes("box"));
  assert.ok(!KNOWN_TAGS.includes("my-widget"));
  assert.equal(Object.keys(DIL_VOCABULARY).length, KNOWN_TAGS.length);
});
