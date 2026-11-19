import assert from "node:assert/strict";
import test from "node:test";
import { iconComponentName, layoutSkin, safeLinkUrl, textSkin } from "./tokens.ts";

test("padding accepts one number, x/y pairs and sides", () => {
  assert.deepEqual(layoutSkin("box", { padding: 3 }).style, { padding: "0.75rem" });
  assert.deepEqual(layoutSkin("box", { padding: { x: 2, y: 1 } }).style, {
    paddingInline: "0.5rem",
    paddingBlock: "0.25rem",
  });
  assert.deepEqual(layoutSkin("box", { padding: { left: 4 } }).style, { paddingLeft: "1rem" });
  assert.deepEqual(layoutSkin("box", { padding: "nope" }).style, {});
});

test("gap takes the spacing scale or an explicit length", () => {
  assert.deepEqual(layoutSkin("row", { gap: 2 }).style, { gap: "0.5rem" });
  assert.deepEqual(layoutSkin("row", { gap: "5px" }).style, { gap: "5px" });
  assert.deepEqual(layoutSkin("row", { gap: "1rem" }).style, { gap: "1rem" });
});

test("named surfaces and literal colours both work; junk is dropped", () => {
  assert.equal(layoutSkin("box", { background: "surface-secondary" }).className.includes("bg-secondary"), true);
  assert.equal(layoutSkin("box", { background: "surface-tertiary" }).className.includes("bg-muted"), true);
  assert.deepEqual(layoutSkin("box", { background: "#168578" }).style, { backgroundColor: "#168578" });
  assert.deepEqual(layoutSkin("box", { background: "rgba(40,128,200,0.07)" }).style, {
    backgroundColor: "rgba(40,128,200,0.07)",
  });
  assert.deepEqual(layoutSkin("box", { background: "url(javascript:alert(1))" }).style, {});
  assert.deepEqual(layoutSkin("box", { background: "expression(alert(1))" }).style, {});
});

test("border handles the boolean form and {size, color, style}", () => {
  assert.equal(layoutSkin("box", { border: true }).className.includes("border-border"), true);
  const named = layoutSkin("box", { border: { size: 1, color: "success" } });
  assert.equal(named.className.includes("border"), true);
  assert.equal(named.className.includes("border-emerald-500/40"), true);
  const dashed = layoutSkin("box", { border: { size: 2, color: "default", style: "dashed" } });
  assert.equal(dashed.className.includes("border-2"), true);
  assert.equal(dashed.className.includes("border-dashed"), true);
  const literal = layoutSkin("box", { border: { size: 1, color: "rgba(33,130,210,0.25)" } });
  assert.deepEqual(literal.style, { borderColor: "rgba(33,130,210,0.25)" });
});

test("radius, width, height and flex map to classes or lengths", () => {
  assert.equal(layoutSkin("box", { radius: "lg" }).className.includes("rounded-xl"), true);
  assert.equal(layoutSkin("box", { radius: "full" }).className.includes("rounded-full"), true);
  assert.deepEqual(layoutSkin("box", { width: "100%", height: "11px" }).style, { width: "100%", height: "11px" });
  assert.deepEqual(layoutSkin("box", { width: "javascript:alert(1)" }).style, {});
  assert.deepEqual(layoutSkin("box", { flex: "1" }).style, { flex: "1" });
  assert.deepEqual(layoutSkin("box", { minHeight: 80 }).style, { minHeight: "80px" });
});

test("grid columns become a template, capped to something sane", () => {
  assert.deepEqual(layoutSkin("grid", { columns: 3 }).style, { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  assert.deepEqual(layoutSkin("grid", { columns: 99 }).style, {});
  assert.equal(String(layoutSkin("grid", { columns: "auto" }).style.gridTemplateColumns).includes("auto-fit"), true);
});

test("alignment tokens are class names", () => {
  const row = layoutSkin("row", { justify: "between", align: "center" });
  assert.equal(row.className.includes("justify-between"), true);
  assert.equal(row.className.includes("items-center"), true);
  const wrapped = layoutSkin("row", { wrap: true, clip: true });
  assert.equal(wrapped.className.includes("flex-wrap"), true);
  assert.equal(wrapped.className.includes("overflow-hidden"), true);
});

test("typography: size, weight, alignment, tabular numbers", () => {
  const title = textSkin("title", { size: "lg" });
  assert.equal(title.className.includes("text-lg"), true);
  const text = textSkin("text", { size: "xs", weight: "medium", tabularNums: true });
  assert.equal(text.className.includes("text-xs"), true);
  assert.equal(text.className.includes("font-medium"), true);
  assert.equal(text.className.includes("tabular-nums"), true);
  const caption = textSkin("caption", { textAlign: "center" });
  assert.equal(caption.className.includes("text-center"), true);
  const raw = textSkin("text", { size: "12px" });
  assert.deepEqual(raw.style, { fontSize: "12px" });
});

test("colours resolve to theme classes, literals, or nothing", () => {
  assert.equal(textSkin("text", { color: "secondary" }).className.includes("text-muted-foreground"), true);
  assert.deepEqual(textSkin("text", { color: "#b7832f" }).style, { color: "#b7832f" });
  assert.deepEqual(textSkin("text", { color: "javascript:alert(1)" }).style, {});
  assert.equal(textSkin("text", { lineThrough: true }).className.includes("line-through"), true);
});

test("icons map kebab-case names and never crash on an unknown one", () => {
  assert.equal(iconComponentName("arrow-down"), "ArrowDown");
  assert.equal(iconComponentName("check_circle"), "CheckCircle");
  assert.equal(iconComponentName(""), null);
  assert.equal(iconComponentName("../../etc/passwd"), null);
  assert.equal(iconComponentName(42), null);
});

test("links only accept inspectable schemes", () => {
  assert.equal(safeLinkUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeLinkUrl("mailto:a@b.test"), "mailto:a@b.test");
  assert.equal(safeLinkUrl("javascript:alert(1)"), undefined);
  assert.equal(safeLinkUrl("data:text/html,<script>alert(1)</script>"), undefined);
  assert.equal(safeLinkUrl(undefined), undefined);
});

test("a list takes the spacing scale and a solid connector", () => {
  assert.equal(layoutSkin("list", { gap: 2 }).className.includes("space-y-2"), true);
  assert.equal(layoutSkin("list", {}).className.includes("space-y-1"), true, "default item spacing");
  assert.equal(layoutSkin("list", { gap: 99 }).className.includes("space-y-1"), true, "off-scale falls back");
  assert.equal(layoutSkin("list", { connector: "solid" }).className.includes("border-l-2"), true);
  assert.equal(layoutSkin("list", { connector: "nope" }).className.includes("border-l-2"), false);
});

test("a table cell honours a column alignment", () => {
  assert.equal(layoutSkin("table-cell", { textAlign: "center" }).className, "text-center");
  assert.equal(layoutSkin("table-cell", { textAlign: "end" }).className, "text-right");
  assert.equal(layoutSkin("table-cell", { textAlign: "nope" }).className, "");
  assert.equal(layoutSkin("table-cell", {}).className, "");
});
