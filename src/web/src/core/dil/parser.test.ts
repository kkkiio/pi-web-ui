import assert from "node:assert/strict";
import test from "node:test";
import { hasDilElements, parse, parseDocument } from "./index.ts";
import type { DilElementNode, DilNode } from "./types.ts";

function elements(nodes: readonly DilNode[], name: string): DilElementNode[] {
  return nodes.filter((node): node is DilElementNode => node.type === "element" && node.name === name);
}

function only(nodes: readonly DilNode[], name: string): DilElementNode {
  const found = elements(nodes, name);
  assert.equal(found.length, 1, `expected exactly one <${name}>, got ${found.length}`);
  return found[0];
}

function walk(nodes: readonly DilNode[], visit: (node: DilNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.type === "element") walk(node.children, visit);
    else if (node.type === "if") for (const branch of node.branches) walk(branch.body, visit);
    else if (node.type === "each") walk(node.body, visit);
  }
}

function expression(element: DilElementNode, name: string): string {
  const attribute = element.attrs.find((candidate) => candidate.name === name);
  assert.ok(attribute, `expected attribute ${name} on <${element.name}>`);
  assert.equal(attribute.kind, "expr");
  return String(attribute.value);
}

test("an out-of-range code point escape does not throw", () => {
  const doc = parseDocument('<box title="\\u{FFFFFF}">ok</box>');
  assert.equal(doc.diagnosticSummary, "clean");
  const box = only(doc.raw, "box");
  const title = box.attrs.find((attribute) => attribute.name === "title");
  assert.ok(title);
  assert.ok(String(title.value).includes("FFFFFF"), "invalid escape stays visible");
});

test("a blockquoted fence keeps its braces", () => {
  // The quote marker sits between the line start and the fence, so the fence used to be
  // missed and `{a: 1}` became an interpolation — the code sample lost content.
  const source = "> ~~~js\n> const x = {a: 1};\n> ~~~";
  const doc = parseDocument(source);
  assert.equal(doc.diagnosticSummary, "clean");
  assert.equal(hasDilElements(doc.tree), false, "a quoted fence is not DIL");
  assert.ok(JSON.stringify(doc.tree).includes("{a: 1}"), "the code keeps its braces");
});

test("email autolinks are prose, not elements", () => {
  const doc = parseDocument("Contact <dev@example.com> for help.");
  assert.equal(doc.diagnosticSummary, "clean");
  assert.equal(
    doc.raw.some((node) => node.type === "element"),
    false,
    "no element may be read out of an autolink",
  );
  assert.ok(JSON.stringify(doc.tree).includes("dev@example.com"));
});

test("Markdown escapes keep braces and tags as prose", () => {
  // `\{` is a literal brace: it must not open an interpolation that then vanishes.
  const escaped = parseDocument("The set is \\{a, b\\}. Use \\<box\\> to group.");
  assert.equal(escaped.diagnosticSummary, "clean");
  const text = JSON.stringify(escaped.tree);
  assert.ok(text.includes("{a, b}"), "escaped braces survive lowering");
  assert.ok(text.includes("<box>"), "escaped tag opener stays prose");
  assert.equal(
    escaped.raw.some((node) => node.type === "expr"),
    false,
    "no interpolation node",
  );

  // An escaped backslash keeps the escape: the brace is a real interpolation again.
  const sharp = parseDocument("路径 C:\\\\ 与 {1 + 1}");
  assert.equal(sharp.diagnosticSummary, "clean");
  assert.ok(
    sharp.raw.some((node) => node.type === "expr" && node.code === "1 + 1"),
    "a brace after an escaped backslash is still an interpolation",
  );
});

test("parses prose mixed with elements, attributes and interpolations", () => {
  const result = parse('前文 **粗体**。\n\n<box padding={3} gap="2" border>\n  <text>{n} 次</text>\n</box>');
  assert.equal(result.diagnosticSummary, "clean");

  const box = only(result.nodes, "box");
  assert.equal(expression(box, "padding"), "3");
  assert.deepEqual(
    box.attrs.map((attribute) => [attribute.name, attribute.kind, attribute.value]),
    [
      ["padding", "expr", "3"],
      ["gap", "string", "2"],
      ["border", "boolean", true],
    ],
  );

  const text = only(box.children, "text");
  assert.deepEqual(
    text.children.map((node) => node.type),
    ["expr", "text"],
  );
});

test("keeps fenced code blocks literal, including DIL-looking content", () => {
  const result = parse("说明：\n\n```html\n<box>{x}</box>\n{#if a}b{/if}\n```\n\n结尾。");
  assert.equal(result.diagnosticSummary, "clean");

  const fence = result.nodes.find((node) => node.type === "fence");
  assert.ok(fence && fence.type === "fence");
  assert.equal(fence.kind, "code");
  assert.equal(fence.info, "html");
  assert.equal(fence.closed, true);
  assert.equal(fence.value, "<box>{x}</box>\n{#if a}b{/if}");
  assert.equal(elements(result.nodes, "box").length, 0);
});

test("keeps <code>, <code-block> and <CodeBlock> content raw", () => {
  const result = parse("<code>for i := 0; i < n; i++ { wg.Add(1) }</code>");
  assert.equal(result.diagnosticSummary, "clean");

  const code = only(result.nodes, "code");
  assert.equal(code.children.length, 1);
  const child = code.children[0];
  assert.ok(child.type === "text");
  assert.equal(child.raw, true);
  assert.equal(child.value, "for i := 0; i < n; i++ { wg.Add(1) }");

  // `CodeBlock` is the tag the model actually writes for a code block (18x in the corpus).
  // Its body is raw too: `**` in JSON or a script stays four characters.
  const block = only(parse('<CodeBlock language="json">{"a": "**", "b": "`"}</CodeBlock>').nodes, "CodeBlock");
  const body = block.children[0];
  assert.ok(body.type === "text");
  assert.equal(body.raw, true);
  assert.equal(body.value, '{"a": "**", "b": "`"}');
});

test("an arrow function inside an attribute does not close the tag", () => {
  const result = parse("<button onClick={() => (a > b ? 1 : 2)}>go</button>");
  assert.equal(result.diagnosticSummary, "clean");
  const button = only(result.nodes, "button");
  assert.equal(expression(button, "onClick"), "() => (a > b ? 1 : 2)");
  assert.equal(button.children.length, 1);
});

test("inline code and math hide directives from the parser", () => {
  const result = parse("写法是 `{#each xs as x}`，公式是 \\(a {b} c\\)，还有 `{$x}`。");
  assert.equal(result.diagnosticSummary, "clean");

  const prose = result.nodes
    .filter((node) => node.type === "text")
    .map((node) => (node.type === "text" ? node.value : ""))
    .join("");
  assert.match(prose, /\{#each xs as x\}/);
  assert.match(prose, /\{\$x\}/);

  const math = result.nodes.find((node) => node.type === "element" && node.name === "math");
  assert.ok(math && math.type === "element");
  assert.equal(math.attrs[0].value, "a {b} c");
  assert.equal(elements(result.nodes, "each").length + elements(result.nodes, "if").length, 0);
});

test("parses if / else if / else branches", () => {
  const result = parse("{#if a}一{:else if b}二{:else}三{/if}");
  assert.equal(result.diagnosticSummary, "clean");
  const node = result.nodes[0];
  assert.ok(node.type === "if");
  assert.deepEqual(
    node.branches.map((branch) => branch.cond),
    ["a", "b", null],
  );
  assert.deepEqual(
    node.branches.map((branch) => (branch.body[0] as { value: string }).value),
    ["一", "二", "三"],
  );
});

test("parses each with item and index", () => {
  const result = parse("{#each items as item, i}<text>{item}</text>{/each}");
  assert.equal(result.diagnosticSummary, "clean");
  const each = result.nodes[0];
  assert.ok(each.type === "each");
  assert.equal(each.list, "items");
  assert.equal(each.item, "item");
  assert.equal(each.index, "i");
  assert.equal(each.pattern, "item, i");
});

test("a malformed each clause falls back to a safe list and item", () => {
  const result = parse("{#each items}<text>x</text>{/each}");
  assert.match(result.diagnosticSummary, /malformed_each/);
  const each = result.nodes[0];
  assert.ok(each.type === "each");
  assert.equal(each.list, "[]");
  assert.equal(each.item, "item");
});

test("missing closing tags keep the node with closed: false", () => {
  const result = parse("<box><text>a</text>");
  const box = only(result.nodes, "box");
  assert.equal(box.closed, false);
  assert.equal(only(box.children, "text").closed, true);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.action]),
    [["unclosed_tag", "recovered_parse"]],
  );
});

test("an unterminated opening tag is dropped instead of rendered half-written", () => {
  const result = parse('前文 <box padding="rgba(59,');
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ["unterminated_string", "unterminated_tag"],
  );
  assert.equal(elements(result.nodes, "box").length, 0);
  const text = result.nodes.find((node) => node.type === "text");
  assert.ok(text && text.type === "text");
  assert.equal(text.value.trim(), "前文");
});

test("an unclosed fence keeps the raw text and reports incomplete_source", () => {
  const result = parse("```ts\nconst a = 1");
  const fence = result.nodes[0];
  assert.ok(fence.type === "fence");
  assert.equal(fence.closed, false);
  assert.equal(fence.value, "const a = 1");
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.action]),
    [["incomplete_source", "recovered_parse"]],
  );
});

test("an app directive still being streamed is deferred, not parsed", () => {
  const result = parse("{@body const x =");
  assert.equal(result.nodes.length, 0);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.action]),
    [["unterminated_braced_value", "deferred"]],
  );
});

test("an app directive that lost its closing brace recovers at end of line", () => {
  const result = parse("{@body const a = {\n<box>x</box>");
  const statement = result.nodes.find((node) => node.type === "stmt");
  assert.ok(statement && statement.type === "stmt");
  assert.equal(statement.code, "const a = {");
  assert.equal(elements(result.nodes, "box").length, 1);
  assert.equal(result.diagnostics[0].action, "recovered_parse");
});

test("unknown blocks and stray terminators are diagnosed and skipped", () => {
  const unknown = parse("{#while x}a{/while}");
  assert.deepEqual(
    unknown.diagnostics.map((diagnostic) => diagnostic.code),
    ["unknown_block", "unexpected_terminator"],
  );

  const stray = parse("a{/if}b");
  assert.deepEqual(
    stray.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.action]),
    [["unexpected_terminator", "dropped"]],
  );
  const text = stray.nodes[0];
  assert.ok(text.type === "text");
  assert.equal(text.value, "ab");
});

test("a mismatched closing tag closes the ancestor and marks the frames unclosed", () => {
  const result = parse("<box><text>a</box>");
  const box = only(result.nodes, "box");
  assert.equal(box.closed, true);
  assert.equal(only(box.children, "text").closed, false);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.expected, diagnostic.found]),
    [["mismatched_tag", "text", "box"]],
  );
});

test("prose spans carry no DIL syntax into the Markdown lexer", () => {
  // Language injection boundary: the host parser owns every DIL construct, so what the
  // Markdown lexer receives is prose only (inline code spans aside — they are prose).
  const source = [
    "{@body const [n, setN] = DIL.useState(0)}",
    "",
    "## 标题 **粗体**",
    "",
    "<box border>",
    "  {#if n > 0}",
    "    <text>正值 {n}</text>",
    "  {:else}",
    "    零",
    "  {/if}",
    "  {#each [1, 2] as x}<text>{x}</text>{/each}",
    "</box>",
    "",
    "行内代码 `{#if}` 与 `{@body}` 属于 prose。",
    "",
    "```js",
    "<box>{n}</box>",
    "```",
  ].join("\n");

  const result = parse(source);
  const spans: string[] = [];
  walk(result.nodes, (node) => {
    if (node.type === "text") spans.push(node.value);
  });

  const DIL_SYNTAX = /<[A-Za-z][\w-]*[\s/>]|\{@[A-Za-z]|\{#[A-Za-z]|\{[\s\S]?[:/][A-Za-z]/;
  for (const span of spans) {
    assert.doesNotMatch(span.replace(/`+[^`]*`+/g, ""), DIL_SYNTAX, `prose span leaked DIL: ${span}`);
  }

  const kinds = new Set<string>();
  walk(result.nodes, (node) => kinds.add(node.type));
  assert.deepEqual([...kinds].sort(), ["each", "element", "expr", "fence", "if", "stmt", "text"]);
});

test("decodes JS string escapes in attributes and HTML entities in raw text", () => {
  const result = parse('<text title="a\\u00e9\\n">Usage &amp; Billing &lt;3</text>');
  const text = only(result.nodes, "text");
  const title = text.attrs.find((attribute) => attribute.name === "title");
  assert.ok(title);
  assert.equal(title.value, "aé\n");

  // Prose entities are decoded by the Markdown lexer at lowering time, not here.
  const child = text.children[0];
  assert.ok(child.type === "text");
  assert.equal(child.value, "Usage &amp; Billing &lt;3");
  const lowered = only(parseDocument("<text>Usage &amp; Billing &lt;3</text>").tree, "text");
  const loweredText = lowered.children[0];
  assert.ok(loweredText.type === "text");
  assert.equal(loweredText.value, "Usage & Billing <3");

  const raw = only(parse("<code>a &amp; b</code>").nodes, "code").children[0];
  assert.ok(raw.type === "text");
  assert.equal(raw.value, "a & b");
});

test("normalizes CRLF and a leading BOM", () => {
  const result = parse("\uFEFFa\r\n<box>\r\nb\r\n</box>");
  assert.equal(result.diagnosticSummary, "clean");
  const box = only(result.nodes, "box");
  const child = box.children[0];
  assert.ok(child.type === "text");
  assert.equal(child.value.trim(), "b");
});

test("diagnostics carry 1-based line and column", () => {
  const result = parse("<box>\n\n  <row>");
  assert.ok(result.diagnostics.length >= 1);
  for (const diagnostic of result.diagnostics) {
    assert.ok(diagnostic.line >= 1);
    assert.ok(diagnostic.column >= 1);
  }
  const unclosed = result.diagnostics.filter((diagnostic) => diagnostic.code === "unclosed_tag");
  assert.deepEqual(
    unclosed.map((diagnostic) => [diagnostic.tag, diagnostic.line]),
    [
      ["row", 3],
      ["box", 1],
    ],
  );
});
