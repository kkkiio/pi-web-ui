import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument, tidyFallback, toFallbackMarkdown } from "./index.ts";

function markdown(source: string): string {
  return toFallbackMarkdown(parseDocument(source).tree);
}

test("prose, headings and emphasis survive the projection", () => {
  const out = markdown("## 标题\n\n**粗体** 与 *斜体* 段落。");
  assert.match(out, /^## 标题/m);
  assert.equal(out.includes("**粗体**"), true);
  assert.equal(out.includes("*斜体*"), true);

  assert.match(markdown("# 一级\n\n## 二级\n\n### 三级"), /^### 三级$/m);
});

test("dynamic values disappear instead of leaking source code", () => {
  const out = markdown("{@body const n = 2}\n\n数量：{n} 次");
  assert.equal(out, "数量： 次");
  assert.equal(out.includes("useState"), false);
});

test("the first if branch and each body stand in for control flow", () => {
  const out = markdown("{#if a}显示的文本{:else}不该出现{/if}\n\n{#each xs as x}- {x}{/each}");
  assert.equal(out.includes("显示的文本"), true);
  assert.equal(out.includes("不该出现"), false);
});

test("lists, tables and blockquotes project to readable markdown", () => {
  const list = markdown("- 第一项\n- 第二项\n\n1. 有序");
  assert.equal(list.includes("- 第一项"), true);
  assert.equal(list.includes("1. 有序"), true);

  const table = markdown("| 方案 | 风险 |\n|---|---|\n| `DIL` | 需要容错 |");
  assert.equal(table.includes("| 方案 | 风险 |"), true);
  assert.equal(table.includes("| --- | --- |"), true);
  assert.equal(table.includes("| `DIL` | 需要容错 |"), true);

  const quote = markdown("> 容错解析不是可选项。");
  assert.equal(quote.includes("> 容错解析不是可选项。"), true);
});

test("code fences, math and links keep their source form", () => {
  const out = markdown(
    '```bash\ncurl -s https://example.com | head -3\n```\n\n公式 $E = mc^2$ 与 [示例](https://a.test "标题")。',
  );
  assert.equal(out.includes("```bash"), true);
  assert.equal(out.includes("curl -s https://example.com | head -3"), true);
  assert.equal(out.includes("$E = mc^2$"), true);
  assert.equal(out.includes('[示例](https://a.test "标题")'), true);

  const block = markdown("$$\nE = mc^2\n$$");
  assert.equal(block.includes("$$"), true, "block math keeps its delimiters");
  assert.equal(block.includes("E = mc^2"), true);
});

test("strikethrough and ordered-list start survive the projection", () => {
  assert.match(markdown("旧值 ~~废弃~~ 保留"), /~~废弃~~/);
  assert.match(markdown("3. 第三\n4. 第四"), /^3\. 第三/m);
});

test("layout containers flatten without losing their content", () => {
  const out = markdown(
    '<box border radius="lg" padding={2}>\n  <row gap={1}>\n    <badge>就绪</badge>\n    <text size="sm">三步流水线</text>\n  </row>\n</box>',
  );
  assert.equal(out.includes("就绪"), true);
  assert.equal(out.includes("三步流水线"), true);
  assert.equal(out.includes("<box"), false);
});

test("tidyFallback drops debris but never edits a fenced block", () => {
  const tidy = tidyFallback("## %\n\n真文字\n\n```\n## %\n---\n```\n\n| --- |\n");
  assert.equal(tidy.includes("## %\n\n真文字"), false);
  assert.equal(tidy.split("\n")[0], "真文字");
  assert.equal(tidy.includes("```\n## %\n---\n```"), true);
});
