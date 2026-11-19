import assert from "node:assert/strict";
import test from "node:test";
import { lowerInline, parseDocument, toFallbackMarkdown } from "./index.ts";
import { lowerMarkdown } from "./markdown.ts";
import { parse } from "./parser.ts";
import type { DilElementNode, DilNode } from "./types.ts";

test("a reference definition stays visible instead of vanishing", () => {
  // Reference links are not resolved; the destination still has to be readable rather
  // than silently deleted with the definition node.
  const document = parseDocument("See [documentation][docs].\n\n[docs]: https://example.com");
  const text = JSON.stringify(document.tree);
  assert.ok(text.includes("[documentation][docs]"), "the reference stays literal");
  assert.ok(text.includes("https://example.com"), "the destination stays visible");
});

test("inline neighbours keep the whitespace between them", () => {
  // `<bold>Hello</bold> <italic>world</italic>` is one paragraph with a space node in the
  // middle; dropping whitespace-only nodes renders `Helloworld`.
  const text = only(tree("<bold>Hello</bold> <italic>world</italic>"), "text");
  const rendered = text.children
    .map((child) => (child.type === "text" ? child.value : child.type === "element" ? child.name : child.type))
    .join("|");
  assert.equal(rendered, "bold| |italic");

  const interpolation = tree("{1} {2}");
  assert.ok(JSON.stringify(interpolation).includes('" "'), "the space between two values survives");
});

test("a fenced example inside a list item stays inside the list", () => {
  // `<box>…</box>` ends a prose run; the indented fence that follows belongs to item 1,
  // not to a top-level DIL fence, or the list renders as two lists around a code block.
  const source = "<box>Summary</box>\n\n1. First\n\n   ~~~js\n   const x = 1;\n   ~~~\n\n2. Second";
  const lists = elements(tree(source), "list");
  assert.equal(lists.length, 1, "one list, not two");
  const first = lists[0].children[0];
  assert.equal(first?.type, "element");
  const item = first as DilElementNode;
  assert.equal(item.name, "list-item");
  assert.ok(
    item.children.some((child) => child.type === "element" && child.name === "code-block"),
    "the example belongs to the first item",
  );
});

test("a loose list stays one list (Markdown owns blank lines)", () => {
  const lists = only(tree("1. first\n\n2. second"), "list");
  const items = lists.children.filter((child) => child.type === "element" && child.name === "list-item");
  assert.equal(items.length, 2, "blank lines separate items, not lists");

  // A continuation paragraph belongs to its item, not to the document.
  const withContinuation = only(tree("1. first\n\n   more detail\n\n2. second"), "list");
  const first = withContinuation.children[0];
  assert.equal(first?.type, "element");
  assert.equal((first as DilElementNode).name, "list-item");
  assert.ok((first as DilElementNode).children.length > 1, "the item keeps its paragraph");
});

test("a code span may cross a line ending", () => {
  // Rejecting the span let its braces through as an interpolation, which is how
  // `{a: 1}` used to disappear from the answer.
  const source = "Use `const x =\n{a: 1}` here";
  const document = parseDocument(source);
  assert.equal(document.diagnosticSummary, "clean");

  const found: DilNode[] = [];
  const walk = (nodes: readonly DilNode[]) => {
    for (const node of nodes) {
      if (node.type === "element") {
        if (node.name === "code") found.push(node);
        walk(node.children);
      }
    }
  };
  walk(document.tree);
  assert.equal(found.length, 1, "expected one code span");
  const code = found[0] as DilElementNode;
  assert.deepEqual(
    code.children.map((child) => (child.type === "text" ? child.value.replace(/\s+/g, " ") : child.type)),
    ["const x = {a: 1}"],
  );
});

test("code elements keep their literal text", () => {
  const code = only(tree('<code-block>const p = "**x**";</code-block>'), "code-block");
  assert.deepEqual(
    code.children.map((child) => (child.type === "text" ? [child.value, child.raw] : child.type)),
    [['const p = "**x**";', true]],
    "asterisks inside code must not become bold nodes",
  );

  // Inline `<code>` sits inside a synthetic `<text>`, so walk to find it.
  const found: DilNode[] = [];
  const walk = (nodes: readonly DilNode[]) => {
    for (const node of nodes) {
      if (node.type === "element") {
        if (node.name === "code") found.push(node);
        walk(node.children);
      }
    }
  };
  walk(tree("<code>**x**</code>"));
  assert.equal(found.length, 1, "expected one <code>");
  const inline = found[0] as DilElementNode;
  assert.deepEqual(
    inline.children.map((child) => (child.type === "text" ? child.value : child.type)),
    ["**x**"],
  );
});

function tree(source: string): DilNode[] {
  return parseDocument(source).tree;
}

function elements(nodes: readonly DilNode[], name: string): DilElementNode[] {
  return nodes.filter((node): node is DilElementNode => node.type === "element" && node.name === name);
}

function only(nodes: readonly DilNode[], name: string): DilElementNode {
  const found = elements(nodes, name);
  assert.equal(found.length, 1, `expected exactly one <${name}>, got ${found.length}`);
  return found[0];
}

function stringAttribute(element: DilElementNode, name: string): string {
  const attribute = element.attrs.find((candidate) => candidate.name === name);
  assert.ok(attribute, `expected attribute ${name} on <${element.name}>`);
  return String(attribute.value);
}

function textOf(nodes: readonly DilNode[]): string {
  return nodes.map((node) => (node.type === "text" ? node.value : "")).join("");
}

function walk(nodes: readonly DilNode[], visit: (node: DilNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.type === "element") walk(node.children, visit);
    else if (node.type === "if") for (const branch of node.branches) walk(branch.body, visit);
    else if (node.type === "each") walk(node.body, visit);
  }
}

function findAll(nodes: readonly DilNode[], name: string): DilElementNode[] {
  const found: DilElementNode[] = [];
  walk(nodes, (node) => {
    if (node.type === "element" && node.name === name) found.push(node);
  });
  return found;
}

/** Merge adjacent text runs and drop offsets: node *boundaries* are not the contract. */
function normalize(nodes: readonly DilNode[]): unknown[] {
  const merged: DilNode[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type === "text" && previous && previous.type === "text" && Boolean(previous.raw) === Boolean(node.raw)) {
      merged[merged.length - 1] = { ...previous, value: previous.value + node.value };
      continue;
    }
    merged.push(node);
  }
  return JSON.parse(
    JSON.stringify(merged, (key, value) => (key === "pos" || key === "end" ? undefined : value)),
  ) as unknown[];
}

function deepText(nodes: readonly DilNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.value;
    else if (node.type === "element") out += deepText(node.children);
  }
  return out;
}

test("headings lower to title with a size", () => {
  const nodes = tree("# 一\n\n## 二\n\n### 三");
  assert.deepEqual(
    elements(nodes, "title").map((title) => [stringAttribute(title, "size"), textOf(title.children)]),
    [
      ["xl", "一"],
      ["lg", "二"],
      ["md", "三"],
    ],
  );
});

test("a paragraph keeps its interpolations inside one text element", () => {
  const nodes = tree("本月 {n} 次，同比增长 **12%**。");
  const text = only(nodes, "text");
  assert.deepEqual(
    text.children.map((child) => child.type),
    ["text", "expr", "text", "element", "text"],
  );
  assert.equal(only(text.children, "bold").children[0].type, "text");
});

test("bullet and ordered lists lower to list / list-item, including nesting", () => {
  const bullet = only(tree("- 第一项\n- 第二项"), "list");
  assert.equal(stringAttribute(bullet, "marker"), "bullet");
  assert.equal(elements(bullet.children, "list-item").length, 2);

  const ordered = only(tree("1. 第一项\n2. 第二项"), "list");
  assert.equal(stringAttribute(ordered, "marker"), "number");

  const nested = only(tree("- 父项\n  - 子项\n- 兄弟项"), "list");
  const items = elements(nested.children, "list-item");
  assert.equal(items.length, 2, "the nested list belongs to the first item");
  assert.equal(elements(items[0].children, "list").length, 1);
  assert.equal(elements(items[0].children, "text").length, 1);
});

test("a GFM table lowers to table / table-row / table-cell with header flags", () => {
  const table = only(tree("| 特性 | 技术 |\n|---|---|\n| `<box>` | JSX |"), "table");
  const rows = elements(table.children, "table-row");
  assert.equal(rows.length, 2);

  const headerCells = elements(rows[0].children, "table-cell");
  assert.equal(headerCells.length, 2);
  for (const cell of headerCells) {
    assert.ok(
      cell.attrs.some((attribute) => attribute.name === "header"),
      "header cells carry the header flag",
    );
  }
  const bodyCells = elements(rows[1].children, "table-cell");
  assert.equal(bodyCells.length, 2);
  assert.equal(textOf(bodyCells[1].children), "JSX");
});

test("a pipe in a table cell follows GFM: escaped, not raw", () => {
  // micromark's GFM table is the reference here: an unescaped `|` always splits a cell,
  // even inside a code span, so a literal pipe has to be written `\\|`.
  const table = only(tree("| a | b |\n|---|---|\n| `x\\|y` | z |"), "table");
  const row = elements(table.children, "table-row")[1];
  const cells = elements(row.children, "table-cell");
  assert.equal(cells.length, 2);
  assert.equal(textOf(only(cells[0].children, "code").children), "x|y");
});

test("blockquotes and thematic breaks lower to blockquote / divider", () => {
  const nodes = tree("> 第一行\n> 第二行\n\n---\n\n结尾");
  const quote = only(nodes, "blockquote");
  assert.equal(only(quote.children, "text").children.length > 0, true);
  assert.equal(elements(nodes, "divider").length, 1);
});

test("inline lowering covers bold, italic, code, Link and autolink", () => {
  const nodes = lowerInline('**粗** *斜* `码` [文](https://a.test "标题") <https://b.test>', 0);
  assert.deepEqual(
    nodes.filter((node) => node.type === "element").map((node) => (node as DilElementNode).name),
    ["bold", "italic", "code", "Link", "Link"],
  );

  const link = elements(nodes, "Link")[0];
  assert.equal(stringAttribute(link, "url"), "https://a.test");
  assert.equal(stringAttribute(link, "title"), "标题");
  assert.equal(textOf(link.children), "文");
});

test("inline math is a DIL node inside the prose flow, and currency is not", () => {
  const math = tree("公式 $x^2$ 与 \\(a + b\\)。");
  assert.deepEqual(
    findAll(math, "math").map((node) => stringAttribute(node, "value")),
    ["x^2", "a + b"],
  );
  // The paragraph stays one text element, so the spaces around the formula survive.
  assert.equal(only(math, "text").children.length, 5);
  assert.equal(deepText(math), "公式  与 。");

  const currency = tree("$20** 是上限，**不是每月最多额外扣 $");
  assert.equal(elements(currency, "math").length, 0);
  assert.match(deepText(currency), /\$20/);
});

test("GFM extensions map onto the text vocabulary", () => {
  const struck = findAll(tree("旧值 ~~已废弃~~ 新值"), "text");
  assert.ok(
    struck.some((node) => node.attrs.some((attribute) => attribute.name === "lineThrough")),
    "strikethrough becomes text with lineThrough",
  );

  const task = only(tree("- [x] 已完成\n- [ ] 待办"), "list");
  const items = elements(task.children, "list-item");
  assert.match(deepText(items[0].children), /☑/);
  assert.match(deepText(items[1].children), /☐/);

  assert.equal(stringAttribute(only(tree("3. 第三\n4. 第四"), "list"), "start"), "3");
});

test("underscores inside a word are not emphasis", () => {
  const nodes = lowerInline("snake_case_name 与 *强调*", 0);
  assert.equal(elements(nodes, "italic").length, 1);
  assert.equal(textOf(nodes).includes("snake_case_name"), true);
});

test("inline code content is never lowered as markdown", () => {
  const code = only(lowerInline("`**not bold** {x} <box>`", 0), "code");
  const child = code.children[0];
  assert.ok(child.type === "text");
  assert.equal(child.value, "**not bold** {x} <box>");
  assert.equal(child.raw, true);
});

test("inside an element, prose stays one inline prose", () => {
  const nodes = tree("<row>数量：{n}，共 **两种**</row>");
  const row = only(nodes, "row");
  assert.deepEqual(
    row.children.map((child) => child.type),
    ["text", "expr", "text", "element"],
  );
  assert.equal(elements(row.children, "text").length, 0, "no <text> wrapper inside a row");
});

test("element interior has no block Markdown, only InlineProse", () => {
  const lines = tree("<box>\n  **布局** 说明\n</box>");
  assert.equal(findAll(lines, "bold").length, 1);
  assert.equal(findAll(lines, "code-block").length, 0);

  // ElementChild has no TableBlock / ListBlock / HeadingBlock: markers stay literal.
  const blocks = only(tree("<box>## 小标题\n\n- 一项\n\n> 引用\n\n---</box>"), "box");
  for (const name of ["title", "list", "table", "blockquote", "divider"]) {
    assert.equal(elements(blocks.children, name).length, 0, `<${name}> must not appear inside an element`);
  }
  // Blank lines are the only separator: one <text> per run, markers included.
  assert.equal(elements(blocks.children, "text").length, 4);
  assert.match(deepText(blocks.children), /## 小标题/);
  assert.match(deepText(blocks.children), /- 一项/);
  assert.match(deepText(blocks.children), /> 引用/);
});

test("document ties still lower block Markdown, element interiors do not", () => {
  const source = "## 标题\n\n- 一项\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  const document = tree(source);
  assert.equal(elements(document, "title").length, 1);
  assert.equal(elements(document, "list").length, 1);
  assert.equal(elements(document, "table").length, 1);

  const box = only(tree(`<box>\n${source}\n</box>`), "box");
  assert.equal(findAll(box.children, "title").length, 0);
  assert.equal(findAll(box.children, "list").length, 0);
  assert.equal(findAll(box.children, "table").length, 0);
});

test("blank lines split an element's prose; a single run stays unwrapped", () => {
  const single = only(tree("<box>文字 **粗体** 结尾</box>"), "box");
  assert.equal(elements(single.children, "text").length, 0, "a lone flow is inline");
  assert.equal(elements(single.children, "bold").length, 1);

  const multi = only(tree("<box>第一段\n\n第二段 **粗**\n</box>"), "box");
  const texts = elements(multi.children, "text");
  assert.equal(texts.length, 2);
  assert.equal(elements(texts[1].children, "bold").length, 1);
});

test("indentation at document level is layout, not an indented code block", () => {
  // micromark's `codeIndented` is disabled for the document tier.
  const nodes = tree("说明：\n\n    **缩进的一段**\n");
  assert.equal(elements(nodes, "code-block").length, 0);
  assert.equal(findAll(nodes, "bold").length, 1);
});

test("fences become code-block / math elements", () => {
  const nodes = tree('```json\n{"a":1}\n```\n\n$$\nE = mc^2\n$$');
  const code = only(nodes, "code-block");
  assert.equal(stringAttribute(code, "language"), "json");
  const raw = code.children[0];
  assert.ok(raw.type === "text");
  assert.equal(raw.value, '{"a":1}');
  assert.equal(raw.raw, true);

  const math = only(nodes, "math");
  assert.equal(stringAttribute(math, "value"), "E = mc^2");
  assert.ok(math.attrs.some((attribute) => attribute.name === "block"));
});

test("InlineRun covers strike, character references, escapes and autolinks", () => {
  const box = only(tree("<box>~~废弃~~ &amp; \\*转义\\* <https://a.test></box>"), "box");
  const struck = elements(box.children, "text").filter((node) =>
    node.attrs.some((attribute) => attribute.name === "lineThrough"),
  );
  assert.equal(struck.length, 1);
  assert.equal(deepText(struck), "废弃");
  assert.match(deepText(box.children), /& /);
  assert.match(deepText(box.children), /\*转义\*/);
  assert.equal(elements(box.children, "Link").length, 1);
});

test("both tiers agree on the InlineRun subset", () => {
  const snippets = [
    "**粗** *斜* `码` ~~删~~",
    '[文](https://a.test "标题") <https://b.test>',
    "&amp; &lt; \\*转义\\* 与 **嵌套 *斜体* 结束**",
  ];

  for (const snippet of snippets) {
    const document = only(tree(snippet), "text");
    const row = only(tree(`<row>${snippet}</row>`), "row");
    assert.deepEqual(normalize(row.children), normalize(document.children), snippet);
  }
});

test("the document tier pairs emphasis with placeholders, not with an AST pass", () => {
  // `lowerMarkdown` on its own has no AST pairing step: inline atoms become placeholders, so
  // micromark sees one `**…**` run and pairs it. This is the whole reason the main pipeline
  // does not call `resolveSpanningEmphasis` for document-level prose.
  for (const source of ['**<Link url="https://a.test" title="A"/>**', '**<Cite refs={["t1"]}/>**', "**{n}**"]) {
    const bold = findAll(lowerMarkdown(parse(source).nodes, { document: true }), "bold")[0];
    assert.ok(bold, `${source} pairs through the lexer`);
  }
});

test("strikethrough spans nodes the same way emphasis does", () => {
  // `~~` is a delimiter like `**`: inside an element there is no lexer to pair it, so it
  // goes through the same AST pass, and the wrapper is `<text lineThrough>`, not `<italic>`.
  const box = only(tree('<box>~~<badge text="b"/>~~</box>'), "box");
  const strike = only(box.children, "text");
  assert.equal(only(strike.children, "badge").name, "badge");
  assert.equal(
    strike.attrs.find((attribute) => attribute.name === "lineThrough")?.value,
    true,
    "the wrapper carries lineThrough",
  );

  // The document tier keeps working through GFM's delete rule.
  assert.equal(findAll(tree("~~<badge/>~~"), "badge").length, 1);
});

test("the element tier pairs emphasis on the AST, because it has no lexer", () => {
  const box = only(tree('<box>\n  **<icon name="star"/>**\n</box>'), "box");
  assert.equal(elements(box.children, "bold").length, 1);

  const link = only(tree('<row>**<Link url="https://a.test">文档</Link>**</row>'), "row");
  assert.equal(elements(link.children, "bold").length, 1);
});

test("half-streamed empty containers are pruned, non-empty ones are kept", () => {
  assert.deepEqual(parseDocument("<box><row>").tree, []);

  const box = only(parseDocument("<box><text>a</text><row>").tree, "box");
  assert.equal(elements(box.children, "row").length, 0, "the empty unclosed row is pruned");
  assert.equal(elements(box.children, "text").length, 1);
});

test("state declarations are collected from {@body} directives", () => {
  const document = parseDocument('{@body const [tab,setTab] = DIL.useState("a"); const count = 2}\n<box>{tab}</box>');
  assert.equal(document.diagnosticSummary, "clean");
  assert.deepEqual(document.state, [{ name: "tab", setter: "setTab", initial: '"a"' }]);
});

test("a host-resolved component stays inside its sentence", () => {
  // ChatGPT's compiler emits `<Cite/>` as a child of the surrounding `<text>`, so a sentence
  // that cites a source is one paragraph, not three. The same holds for `<Entity/>`.
  const cite = tree('GitHub 默认包含 bug<Cite refs={["t1"]}/>。');
  assert.equal(cite.length, 1, "one paragraph, not a split at the tag");
  assert.equal(cite[0]?.type, "element");
  assert.equal((cite[0] as DilElementNode).name, "text");
  assert.deepEqual(
    (cite[0] as DilElementNode).children.map((child) => (child.type === "element" ? child.name : child.type)),
    ["text", "Cite", "text"],
  );

  const entity = tree('全名是 <Entity category="software" value="Microsoft Orleans"/>。');
  assert.equal(entity.length, 1);
});

test("emphasis never wraps a container", () => {
  // `<text>` is the compiled form of a Markdown paragraph: an emphasis pair spanning it would
  // put a block inside a sentence. The markers stay literal instead.
  const wrapped = tree("**<text>x</text>**");
  assert.equal(findAll(wrapped, "bold").length, 0, "no <bold> around a container");

  // An unknown tag is not a member of the vocabulary either, so it is not guessed to be inline.
  assert.equal(findAll(tree('**<my-widget text="b"/>**'), "bold").length, 0);
});

test("a Markdown column alignment reaches the cell and survives the copy back", () => {
  const source = "| left | middle | right |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |";
  const table = only(tree(source), "table");
  const header = table.children[0];
  assert.equal(header?.type, "element");
  const aligns = (header as DilElementNode).children.map(
    (cell) => (cell as DilElementNode).attrs.find((attribute) => attribute.name === "textAlign")?.value,
  );
  assert.deepEqual(aligns, ["left", "center", "right"]);

  assert.ok(
    toFallbackMarkdown(table ? [table] : []).includes("| :--- | :---: | ---: |"),
    "the delimiter row keeps the alignment",
  );
});
