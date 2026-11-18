import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument } from "./index.ts";
import { repairStreamTail } from "./stream-repair.ts";
import type { DilElementNode, DilNode } from "./types.ts";

function tree(source: string): DilNode[] {
  return parseDocument(source).tree;
}

/** Every element with this name, at any depth. */
function findAll(nodes: readonly DilNode[], name: string, out: DilElementNode[] = []): DilElementNode[] {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (node.name === name) out.push(node);
    findAll(node.children, name, out);
  }
  return out;
}

function textValues(nodes: readonly DilNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "text") out.push(node.value);
    else if (node.type === "element") textValues(node.children, out);
    else if (node.type === "each") textValues(node.body, out);
    else if (node.type === "if") for (const branch of node.branches) textValues(branch.body, out);
  }
  return out;
}

function plainText(nodes: readonly DilNode[]): string {
  return textValues(nodes).join("");
}

// ---------------------------------------------------------------------------
// The repair itself — a text transform, no AST involved
// ---------------------------------------------------------------------------

test("an unclosed bold at the tail is closed: the ChatGPT Frame 29 shape", () => {
  assert.equal(repairStreamTail("**LLM Encoder"), "**LLM Encoder**");
  assert.equal(repairStreamTail("**CL"), "**CL**");
});

test("the repair does not care about indentation: ChatGPT Frame 126", () => {
  // Four spaces of indentation are layout, not a code block, so `**CL` still opens bold.
  assert.equal(repairStreamTail("    **CL"), "    **CL**");
});

test("an unclosed inline code span is closed, but a fence is not", () => {
  assert.equal(repairStreamTail("`192.168.1.1"), "`192.168.1.1`");
  assert.equal(repairStreamTail("``a`b"), "``a`b``");
  assert.equal(repairStreamTail("```js"), "```js");
  assert.equal(repairStreamTail("```js\nconst a = 1"), "```js\nconst a = 1");
});

test("an unclosed strike is closed", () => {
  assert.equal(repairStreamTail("~~删"), "~~删~~");
});

test("nested openers are closed innermost first", () => {
  assert.equal(repairStreamTail("**a *b"), "**a *b***");
  assert.equal(repairStreamTail("***a"), "***a***");
});

test("an incomplete link keeps its label and drops the half-received target", () => {
  assert.equal(repairStreamTail("[文档](https://exa"), "文档");
  assert.equal(repairStreamTail("见 [文档](https://example.com/a"), "见 文档");
  assert.equal(repairStreamTail("[](http://x"), "");
});

test("a complete link, a complete span and a lone marker are left alone", () => {
  assert.equal(repairStreamTail("[文档](https://example.com)"), "[文档](https://example.com)");
  assert.equal(repairStreamTail("完成 **粗体** 与 `code`"), "完成 **粗体** 与 `code`");
  assert.equal(repairStreamTail("a * b"), "a * b");
  assert.equal(repairStreamTail("价格 20~25 元"), "价格 20~25 元");
  assert.equal(repairStreamTail("3 * 4 = 12"), "3 * 4 = 12");
});

test("only the tail paragraph is active; a finished paragraph keeps its bytes", () => {
  assert.equal(repairStreamTail("第一段 **x\n\n**CL"), "第一段 **x\n\n**CL**");
  assert.equal(repairStreamTail("**CL\n\n第二段"), "**CL\n\n第二段");
});

test("trailing whitespace stays outside the closers", () => {
  assert.equal(repairStreamTail("**CL\n"), "**CL**\n");
  assert.equal(repairStreamTail("**CL  "), "**CL**  ");
  assert.equal(repairStreamTail("**CL  \n"), "**CL**  \n");
});

test("a bracket inside a code span is not a link", () => {
  assert.equal(repairStreamTail("`a[b](c"), "`a[b](c`");
});

test("a marker inside a closed code span does not open anything", () => {
  assert.equal(repairStreamTail("`**a**` 结束"), "`**a**` 结束");
});

// ---------------------------------------------------------------------------
// Through the pipeline — document tier and element tier agree
// ---------------------------------------------------------------------------

test("the document tier lowers a repaired tail to <bold> and <code>", () => {
  const bold = tree("**CL");
  assert.equal(findAll(bold, "bold").length, 1);
  assert.equal(plainText(bold), "CL");

  const indented = tree("    **CL");
  assert.equal(findAll(indented, "bold").length, 1);
  assert.equal(plainText(indented), "CL");

  const code = tree("`192.168.1.1");
  assert.equal(findAll(code, "code").length, 1);
  assert.equal(plainText(code), "192.168.1.1");
});

test("the element tier repairs its trailing text the same way", () => {
  const bold = tree("<box>**CL");
  assert.equal(findAll(bold, "bold").length, 1);
  assert.equal(plainText(bold), "CL");

  const code = tree("<box>看 `192.168.1.1");
  assert.equal(findAll(code, "code").length, 1);
  assert.equal(plainText(code), "看 192.168.1.1");
});

test("a list item that starts bold mid-stream keeps its marker", () => {
  const nodes = tree("- **CL");
  const items = findAll(nodes, "list-item");
  assert.equal(items.length, 1);
  assert.equal(findAll(items[0].children, "bold").length, 1);
  assert.equal(plainText(items[0].children), "CL");
});

test("an incomplete link collapses to its label, with no raw destination", () => {
  const nodes = tree("见 [文档](https://exa");
  assert.equal(findAll(nodes, "Link").length, 0);
  assert.equal(plainText(nodes), "见 文档");
  assert.equal(
    textValues(nodes).some((value) => value.includes("https://")),
    false,
  );
});

test("a paragraph followed by `-` or `=` is not a setext heading", () => {
  for (const source of ["intro\n-", "intro\n===", "intro\n="]) {
    const nodes = tree(source);
    assert.equal(findAll(nodes, "title").length, 0, `unexpected title for ${JSON.stringify(source)}`);
    assert.equal(plainText(nodes).includes("intro"), true);
  }
  // `---` is a real thematic break, not an underline for the paragraph before it.
  const divider = tree("intro\n---");
  assert.equal(findAll(divider, "title").length, 0);
  assert.equal(findAll(divider, "divider").length, 1);
});

test("a fence is never repaired with a stray backtick", () => {
  const nodes = tree("```js\nconst a = 1");
  const blocks = findAll(nodes, "code-block");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].closed, false);
  assert.equal(plainText(blocks[0].children), "const a = 1");
});

test("every prefix of a bold opening stays free of raw asterisks", () => {
  const source = "**LLM Encoder 是编码器";
  for (let cut = 3; cut <= source.length; cut++) {
    const prefix = source.slice(0, cut);
    const values = textValues(tree(prefix));
    assert.equal(
      values.some((value) => value.includes("**")),
      false,
      `raw ** leaked at prefix ${JSON.stringify(prefix)}`,
    );
  }
});

test("a complete document still lowers verbatim", () => {
  const source = "## 标题\n\n段落 **粗体** 与 `code`，以及 [链接](https://example.com)。";
  const nodes = tree(source);
  assert.equal(findAll(nodes, "title").length, 1);
  assert.equal(findAll(nodes, "bold").length, 1);
  assert.equal(findAll(nodes, "code").length, 1);
  assert.equal(findAll(nodes, "Link").length, 1);
});
