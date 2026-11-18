import assert from "node:assert/strict";
import test from "node:test";
import { hasDilElements } from "./detect.ts";
import { parseDocument } from "./index.ts";

function detect(source: string): boolean {
  return hasDilElements(parseDocument(source).tree);
}

test("plain Markdown is not DIL", () => {
  assert.equal(detect("## 标题\n\n段落 **粗体** 与 `code` 和 [链接](https://example.com)。"), false);
  assert.equal(detect("- 一项\n- 二项\n\n| a | b |\n|---|---|\n| 1 | 2 |"), false);
  assert.equal(detect(""), false);
});

test("a fenced code sample is not DIL, even when it contains tags", () => {
  assert.equal(detect("```jsx\n<box padding={2}>hi</box>\n```"), false);
});

test("source DIL tags are DIL", () => {
  assert.equal(detect("<box padding={2}>hi</box>"), true);
  assert.equal(detect("文字\n\n<row><text>a</text></row>"), true);
  assert.equal(detect('<icon name="check"/>'), true);
});

test("control flow and interpolation count as DIL", () => {
  assert.equal(detect("{#each items as item}<text>{item}</text>{/each}"), true);
  assert.equal(detect("{#if shown}<text>yes</text>{/if}"), true);
  assert.equal(detect("<text>共 {n} 项</text>"), true);
  assert.equal(detect("{@body const n = 2}"), true);
});
