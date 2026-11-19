import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderExamplesModule } from "../scripts/gen-dil-examples.mjs";
import { parseDocument } from "../src/web/src/core/dil/index.ts";
import { DIL_PROMPT_EXAMPLES } from "./system-prompt.ts";

test("every prompt example parses without diagnostics", () => {
  for (const [name, source] of Object.entries(DIL_PROMPT_EXAMPLES)) {
    const document = parseDocument(source);
    assert.deepEqual(
      document.diagnostics.map((d) => d.code),
      [],
      `${name} example must parse cleanly`,
    );
  }
});

test("examples.gen.ts matches extensions/*.dil.md", () => {
  const actual = readFileSync(new URL("./examples.gen.ts", import.meta.url), "utf8");
  assert.equal(actual, renderExamplesModule(), "extensions/examples.gen.ts is stale — run `just gen`");
});
