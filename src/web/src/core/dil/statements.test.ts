import assert from "node:assert/strict";
import test from "node:test";
import { splitStatements } from "./index.ts";

test("splits {@body} statements only at top-level semicolons", () => {
  assert.deepEqual(splitStatements('const a = {x:1;}; const b = "a;b"'), ["const a = {x:1;}", 'const b = "a;b"']);
  assert.deepEqual(splitStatements(" const a = 1 ; "), ["const a = 1"]);
  assert.deepEqual(splitStatements(""), []);
});
