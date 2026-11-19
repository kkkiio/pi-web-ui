import assert from "node:assert/strict";
import test from "node:test";
import { mathHtml } from "./math.ts";

test("a math expression renders as KaTeX markup", () => {
  const inline = mathHtml("E = mc^2", false);
  assert.ok(inline?.includes("katex"), "inline math goes through KaTeX");
  assert.ok(!inline?.includes("katex-display"), "inline math is not display mode");

  const block = mathHtml("E = mc^2", true);
  assert.ok(block?.includes("katex-display"), "`block` switches display mode");
});

test("invalid LaTeX renders as a KaTeX error, not as markup or a throw", () => {
  const html = mathHtml("\\frac{1}{", false);
  assert.ok(html?.includes("katex-error"), "KaTeX reports the error in its own output");
  assert.ok(!html?.includes("<script"), "no markup is passed through");
});

test("links cannot be smuggled through math", () => {
  // `trust: false` — `\href` renders as text instead of an anchor.
  const html = mathHtml("\\href{javascript:alert(1)}{click}", false);
  assert.ok(!html?.includes("<a "), "no anchor is produced");
});

test("empty input produces nothing", () => {
  assert.equal(mathHtml("", false), null);
  assert.equal(mathHtml("   ", true), null);
});
