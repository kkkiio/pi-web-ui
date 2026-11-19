import assert from "node:assert/strict";
import test from "node:test";
import { tokenCacheKey } from "../../../components/ai-elements/code-cache.ts";

test("two revisions of one example never share a token cache entry", () => {
  // Same length, same first and last 100 characters, different middle — the shape the old
  // head/tail key collided on, which made the second block render the first one's source.
  const head = "a".repeat(100);
  const tail = "z".repeat(100);
  const first = `${head}${"x".repeat(20)}${tail}`;
  const second = `${head}${"y".repeat(20)}${tail}`;

  assert.equal(first.length, second.length);
  assert.notEqual(tokenCacheKey(first, "ts"), tokenCacheKey(second, "ts"));
});

test("the key still separates languages and identical sources stay stable", () => {
  const code = "const a = 1;";
  assert.equal(tokenCacheKey(code, "ts"), tokenCacheKey(code, "ts"), "same input, same key");
  assert.notEqual(tokenCacheKey(code, "ts"), tokenCacheKey(code, "js"));
});
