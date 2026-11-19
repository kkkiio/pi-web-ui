import assert from "node:assert/strict";
import test from "node:test";
import type { DilScope } from "../../core/dil/evaluator.ts";
import { collectStatements, evaluateStatements, parseDocument } from "../../core/dil/index.ts";
import { type ResolvedNode, type ResolvedProps, resolveNodes } from "./resolve.ts";

function count(nodes: readonly ResolvedNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (node.kind === "element") total += count(node.children);
  }
  return total;
}

test("nested loops cannot expand without bound", () => {
  const source =
    "{#each Array.from({ length: 400 }) as r}{#each Array.from({ length: 400 }) as c}<text>x</text>{/each}{/each}";
  const resolved = resolveNodes(parseDocument(source).tree, {});
  // 400 × 400 = 160k would overflow the stack while pushing; the pass is capped instead.
  assert.ok(count(resolved) <= 5_000, `resolved ${count(resolved)} nodes`);
});

test("a large but legitimate loop still renders", () => {
  const source = "{#each Array.from({ length: 300 }) as i}<text>{i}</text>{/each}";
  const resolved = resolveNodes(parseDocument(source).tree, {});
  // One `<text>` element plus its interpolated text node per item.
  assert.equal(count(resolved), 600);
});

function scopeOf(source: string): DilScope {
  return evaluateStatements(collectStatements(parseDocument(source).raw));
}

function resolved(source: string, scope: DilScope = {}): ResolvedNode[] {
  return resolveNodes(parseDocument(source).tree, scope);
}

function text(nodes: readonly ResolvedNode[]): string {
  return nodes.map((node) => (node.kind === "text" ? node.value : text(node.children))).join("");
}

function find(nodes: readonly ResolvedNode[], name: string): ResolvedNode[] {
  const out: ResolvedNode[] = [];
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    if (node.name === name) out.push(node);
    out.push(...find(node.children, name));
  }
  return out;
}

test("each repeats its body with item and index bound", () => {
  const nodes = resolved("{#each ['a', 'b'] as item, i}<text>{i}:{item}</text>{/each}");
  assert.equal(find(nodes, "text").length, 2);
  assert.equal(text(nodes), "0:a1:b");
});

test("each reads its list from the statement scope and supports expressions", () => {
  const scope = scopeOf("{@body const items = [{ n: 1 }, { n: 2 }, { n: 3 }]}");
  const filtered = resolved("{#each items.filter(m => m.n > 1) as m}<text>{m.n}</text>{/each}", scope);
  assert.equal(text(filtered), "23");
});

test("nested each sees both frames", () => {
  const scope = scopeOf("{@body const groups = [{ xs: [1, 2] }, { xs: [3] }]}");
  const nodes = resolved("{#each groups as group, g}{#each group.xs as x}<text>{g}.{x};</text>{/each}{/each}", scope);
  assert.equal(text(nodes), "0.1;0.2;1.3;");
});

test("if/else picks the first true branch and falls back to false on failure", () => {
  const shown = resolved("{#if 1 < 2}yes{:else}no{/if}");
  assert.equal(text(shown), "yes");
  const hidden = resolved("{#if 1 > 2}yes{:else}no{/if}");
  assert.equal(text(hidden), "no");
  const broken = resolved("{#if items.missing.deep}yes{/if}", {});
  assert.equal(text(broken), "");
});

test("interpolation formats values and drops the empty ones", () => {
  const nodes = resolved("<text>共 {n} 项，{missing}, 完成</text>", { n: 3 });
  assert.equal(text(nodes), "共 3 项，, 完成");
  const broken = resolved("<text>a{m.p.toFixed(}b</text>", {});
  assert.equal(text(broken), "ab");
});

test("attributes resolve in all four forms, with undefined on failure", () => {
  const [box] = find(resolved("<box padding={2} radius='lg' border gap={n}>x</box>", { n: 3 }), "box");
  assert.ok(box && box.kind === "element");
  assert.equal(box.props.padding, 2);
  assert.equal(box.props.radius, "lg");
  assert.equal(box.props.border, true);
  assert.equal(box.props.gap, 3);

  const [broken] = find(resolved("<box gap={oops.missing.x}>y</box>", {}), "box");
  assert.ok(broken && broken.kind === "element");
  assert.equal(broken.props.gap, undefined);
});

test("a broken expression never removes its siblings", () => {
  const nodes = resolved("<text>before {oops.custom(} after</text>");
  assert.equal(text(nodes), "before  after");
});

test("fences become code-block and math elements", () => {
  const code = resolved("```js\nconst a = 1\n```");
  const [block] = find(code, "code-block");
  assert.ok(block && block.kind === "element");
  assert.equal(block.props.language, "js");
  assert.equal(text(block.children), "const a = 1");

  const math = resolved("$$\nE = mc^2\n$$");
  const [expression] = find(math, "math");
  assert.ok(expression && expression.kind === "element");
  assert.equal(expression.props.block, true);
  assert.equal(expression.props.value, "E = mc^2");
});

test("statements are hoisted, never rendered", () => {
  const source = "{@body const n = 2}<text>{n}</text>";
  const nodes = resolved(source, scopeOf(source));
  assert.equal(text(nodes), "2");
  assert.equal(find(nodes, "stmt").length, 0);
});

test("DIL.useState initials join the scope and setters are inert until #48", () => {
  const scope = scopeOf("{@body const [open, setOpen] = DIL.useState(true)}");
  assert.equal(scope.open, true);
  const nodes = resolved("{#if open}<text>shown</text>{/if}", scope);
  assert.equal(text(nodes), "shown");
});

test("a real DIL sample renders its each over inline data", () => {
  const source = [
    "<box gap={3}>",
    "  {#each [{name:'Claude',p:99.5},{name:'Sol',p:96.2}] as m}",
    "    <row justify='between' align='center'>",
    "      <text weight='medium' size='sm'>{m.name}</text>",
    "      <text tabularNums>{m.p.toFixed(1)}%</text>",
    "    </row>",
    "  {/each}",
    "</box>",
  ].join("\n");
  const nodes = resolved(source);
  assert.equal(find(nodes, "text").length, 4);
  assert.equal(text(nodes).replace(/\s+/g, ""), "Claude99.5%Sol96.2%");
  const [box] = find(nodes, "box");
  assert.ok(box && box.kind === "element");
  assert.equal(box.props.gap, 3);
});

test("a streaming fence reaches the renderer with closed: false", () => {
  // The heavy leaves skip KaTeX/Shiki until the construct closes. `closed` is structural —
  // lowering keeps it on the node — so the element path has to forward it into props.
  const resolveFirst = (source: string) =>
    (resolveNodes(parseDocument(source).tree, {})[0] as { props: ResolvedProps }).props;

  assert.equal(resolveFirst("```js\nconst a = 1").closed, false);
  assert.equal(resolveFirst("```js\nconst a = 1;\n```").closed, true);
  assert.equal(resolveFirst("$$\n\\int_0^1").closed, false);
  assert.equal(resolveFirst("$$\n\\int_0^1\n$$").closed, true);
  assert.equal(resolveFirst("**<text>x</text>**").closed, true, "a non-fence element is closed");
});
