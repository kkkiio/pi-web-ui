import assert from "node:assert/strict";
import { test } from "node:test";
import { isSvgTag, svgIdPrefix, svgProps, svgValue } from "./svg-map.ts";

const PREFIX = "dil-n-0";

test("the vocabulary covers the tags #47 names", () => {
  for (const tag of ["svg", "defs", "marker", "rect", "path", "line", "circle", "text"]) {
    assert.ok(isSvgTag(tag), `missing ${tag}`);
  }
  assert.equal(isSvgTag("foreignObject"), false);
  assert.equal(isSvgTag("box"), false);
});

test("geometry and paint attributes survive", () => {
  assert.deepEqual(svgProps("rect", { x: 30, y: 10, width: "28", height: 20, rx: 3, fill: "currentColor" }, PREFIX), {
    x: 30,
    y: 10,
    width: "28",
    height: 20,
    rx: 3,
    fill: "currentColor",
  });
});

test("attributes outside the tag's allowlist are dropped", () => {
  const props = svgProps("rect", { x: 1, onClick: "alert(1)", href: "https://exa.mple", className: "x" }, PREFIX);
  assert.deepEqual(Object.keys(props), ["x"]);
});

test("event handlers and styles never reach React", () => {
  const props = svgProps(
    "path",
    { d: "M0 0", onLoad: "x", onMouseOver: "x", style: "fill:url(x)", class: "c" },
    PREFIX,
  );
  assert.deepEqual(props, { d: "M0 0" });
});

test("ids are namespaced per diagram and references follow", () => {
  const marker = svgProps("marker", { id: "arrow", markerWidth: 6, refX: 5, orient: "auto" }, PREFIX);
  assert.equal(marker.id, "dil-n-0-arrow");

  const path = svgProps("path", { d: "M0 0 L6 3 Z", markerEnd: "url(#arrow)" }, PREFIX);
  assert.equal(path.markerEnd, "url(#dil-n-0-arrow)");

  const fill = svgProps("rect", { width: 1, height: 1, fill: "url(#gradient)" }, PREFIX);
  assert.equal(fill.fill, "url(#dil-n-0-gradient)");
});

test("external references are refused", () => {
  assert.equal(svgValue("url(https://evil.test/x.svg)", PREFIX), undefined);
  assert.equal(svgValue("url(data:text/html,<script>alert(1)</script>)", PREFIX), undefined);
  assert.equal(svgValue("javascript:alert(1)", PREFIX), undefined);
  assert.equal(svgValue("<script>", PREFIX), undefined);
});

test("non-scalar and non-finite values are dropped", () => {
  assert.equal(svgValue(Number.NaN, PREFIX), undefined);
  assert.equal(svgValue(Number.POSITIVE_INFINITY, PREFIX), undefined);
  assert.equal(svgValue({ x: 1 }, PREFIX), undefined);
  assert.equal(svgValue(true, PREFIX), undefined);
  assert.equal(svgValue("", PREFIX), undefined);
});

test("the id prefix is stable and DOM-safe", () => {
  assert.equal(svgIdPrefix("n.2.1"), "dil-n-2-1");
  assert.equal(svgIdPrefix("n.2.1"), svgIdPrefix("n.2.1"));
  assert.match(svgIdPrefix("a b/c"), /^dil-[\w-]+$/);
});

test("text keeps the attributes SVG text needs", () => {
  const props = svgProps("text", { x: 20, y: 12, fontSize: 10, textAnchor: "middle", fill: "currentColor" }, PREFIX);
  assert.deepEqual(props, { x: 20, y: 12, fontSize: 10, textAnchor: "middle", fill: "currentColor" });
});
