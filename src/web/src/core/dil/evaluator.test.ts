// biome-ignore-all lint/suspicious/noTemplateCurlyInString: DIL sources contain `${…}` by design
import assert from "node:assert/strict";
import test from "node:test";
import {
  callSafe,
  DilEvaluationError,
  evaluateCondition,
  evaluateExpression,
  evaluateList,
  evaluateStatements,
  formatValue,
  safeEvaluate,
} from "./evaluator.ts";

function value(source: string, scope: Record<string, unknown> = {}): unknown {
  return evaluateExpression(source, scope);
}

/** Every failure mode must land on the __dilSafe fallback, never throw. */
function fallback(source: string, scope: Record<string, unknown> = {}): unknown {
  return safeEvaluate(source, scope, "<failed>");
}

test("allocating builtins are bounded by their result, not just their argument", () => {
  // Two node visits, 100 MB of string: the step budget cannot see this.
  assert.equal(fallback("'a'.repeat(1000).repeat(100000)"), "<failed>");
  assert.equal(fallback("'a'.repeat(100000).split('')"), "<failed>");
  assert.equal(fallback("'x'.repeat(100000) + 'y'.repeat(100000)"), "<failed>");
  assert.equal(fallback("Array.from({ length: 10 }).join('ab').repeat(1e6)"), "<failed>");

  // Ordinary sizes stay usable.
  assert.equal(value("'ab'.repeat(3)"), "ababab");
  assert.equal(value("'a,b'.split(',').length"), 2);
  assert.equal(value("Array.from({ length: 3 }).join('-')"), "0-1-2");
});

test("an optional chain short-circuits the rest of the chain", () => {
  // `greet` must be an arrow the evaluator created — a host function is (correctly) not
  // callable, so it is built through a statement instead.
  const scope = {
    ...evaluateStatements(["const greet = () => 'hi'"]),
    user: null,
    other: { profile: { name: "Ada" } },
  };

  // `user?.profile.name` must skip `.name`, not read it off `undefined`.
  assert.equal(value("user?.profile.name", scope), undefined);
  assert.equal(value("user?.profile.name ?? 'Unknown'", scope), "Unknown");
  assert.equal(value("user?.profile.name", scope) ?? "Unknown", "Unknown");
  assert.equal(value("other?.profile?.name", scope), "Ada");

  // A skipped call is skipped too: `greet` lives in the scope, `missing` is null.
  const calls = { ...scope, missing: null };
  assert.equal(value("greet?.()", calls), "hi");
  assert.equal(value("missing?.()", calls), undefined);
  assert.equal(value("missing?.() ?? 'none'", calls), "none");
  // Arguments are not evaluated when the call is skipped: `missing` is not in scope.
  assert.equal(value("missing?.(undeclared) ?? 'none'", calls), "none");

  // Parentheses end the chain: `(user?.profile).name` is a real read of `name` on
  // `undefined`, which is an error rather than `undefined`.
  assert.equal(fallback("(user?.profile).name", scope), "<failed>");
});

test("a recursive expression cannot run unbounded work", () => {
  const scope = evaluateStatements(["const f = n => n > 0 ? f(n - 1) + f(n - 1) : 1"]);
  const started = Date.now();
  // Exponential work at shallow depth: a depth limit or an array cap would not stop it.
  assert.equal(safeEvaluate("f(40)", scope, "budget"), "budget");
  assert.ok(Date.now() - started < 5_000, "the budget must cut the work off quickly");

  // Ordinary bulk work stays inside the budget.
  assert.equal(value("Array.from({ length: 10000 }).map((x) => x * 2).length"), 10000);
});

test("grouping parentheses are part of the expression", () => {
  assert.equal(value("(1 + 2)"), 3);
  assert.equal(value("(((7)))"), 7);
  assert.equal(value("(n) * 2", { n: 4 }), 8);
  assert.equal(evaluateCondition("(true)", {}), true);
  // Trailing input is still a syntax error, not a silently truncated expression.
  assert.equal(fallback("(1) 2"), "<failed>");
  assert.equal(fallback("1) + 2"), "<failed>");
});

test("literals, arithmetic and precedence", () => {
  assert.equal(value("42"), 42);
  assert.equal(value("2 + 3 * 4"), 14);
  assert.equal(value("(2 + 3) * 4"), 20);
  assert.equal(value("10 % 3"), 1);
  assert.equal(value("7 / 2"), 3.5);
  assert.equal(value("-2 + 1"), -1);
  assert.equal(value("!true"), false);
  assert.equal(value('"a" + "b"'), "ab");
  assert.equal(value('"n=" + 5'), "n=5");
  assert.equal(value("true === true"), true);
  assert.equal(value("1 < 2 && 2 <= 2"), true);
  assert.equal(value("null ?? 3"), 3);
  assert.equal(value("0 ?? 3"), 0);
  assert.equal(value('"" || "fallback"'), "fallback");
  assert.equal(value("1 > 2 ? 'yes' : 'no'"), "no");
});

test("literals: booleans, null, undefined, arrays and objects", () => {
  assert.equal(value("true"), true);
  assert.equal(value("null"), null);
  assert.equal(value("undefined"), undefined);
  assert.deepEqual(value("[1, 2 + 1, 'x']"), [1, 3, "x"]);
  assert.deepEqual(value('{ name: "x", p: 99.5, "k-y": 1 }'), { name: "x", p: 99.5, "k-y": 1 });
});

test("template literals interpolate and format", () => {
  assert.equal(value("`共 ${2 + 1} 项`"), "共 3 项");
  assert.equal(value("`${m.p}%`", { m: { p: 96.2 } }), "96.2%");
  assert.equal(value("`${m.name} ${m.p.toFixed(1)}%`", { m: { name: "Sol", p: 96.25 } }), "Sol 96.3%");
  assert.equal(value("`${undefined}`"), "");
  assert.equal(value("`${[1, 2]}`"), "1, 2");
});

test("member and index access, including optional chaining", () => {
  const scope = { m: { p: 99.5, tags: ["a", "b"] }, items: [{ name: "x" }] };
  assert.equal(value("m.p", scope), 99.5);
  assert.equal(value("m.tags[1]", scope), "b");
  assert.equal(value("items[0].name", scope), "x");
  assert.equal(value("items.length", scope), 1);
  assert.equal(value("m.missing?.deep", scope), undefined);
  assert.equal(value("m.tags?.[0]", scope), "a");
  assert.equal(fallback("m.missing.deep", scope), "<failed>");
  assert.equal(fallback("m.tags[9].name", scope), "<failed>");
});

test("arrow functions drive the array methods", () => {
  const scope = {
    items: [
      { name: "a", p: 99.5 },
      { name: "b", p: 96.2 },
    ],
  };
  assert.deepEqual(value("items.map(m => m.p)", scope), [99.5, 96.2]);
  assert.deepEqual(value("items.map((m, i) => `${i}:${m.name}`)", scope), ["0:a", "1:b"]);
  assert.deepEqual(value("items.filter(m => m.p > 97).map(m => m.name)", scope), ["a"]);
  assert.deepEqual(value("items.map(m => ({ label: m.name }))", scope), [{ label: "a" }, { label: "b" }]);
  assert.equal(value("items.find(m => m.name === 'b').p", scope), 96.2);
  assert.equal(value("items.findIndex(m => m.name === 'b')", scope), 1);
  assert.equal(value("items.some(m => m.p > 99)", scope), true);
  assert.equal(value("items.every(m => m.p > 90)", scope), true);
  assert.equal(value("items.map(m => m.p).reduce((a, b) => a + b, 0)", scope), 195.7);
  assert.equal(value("items.map(m => m.name).join('/')", scope), "a/b");
});

test("nested arrows and nested each-style access", () => {
  const scope = { data: [{ name: "a", points: [1, 2] }] };
  assert.deepEqual(value("data.map(d => d.points.map(p => p * 2))", scope), [[2, 4]]);
  assert.equal(value("data.map(d => d.points.length).join(',')", scope), "2");
});

test("string and number methods", () => {
  assert.equal(value("'a-b-c'.split('-').join(' ')"), "a b c");
  assert.deepEqual(value("'abc'.split()"), ["abc"]);
  assert.equal(value("'  x  '.trim()"), "x");
  assert.equal(value("'Hello'.toUpperCase()"), "HELLO");
  assert.equal(value("'hello'.includes('ell')"), true);
  assert.equal(value("'hello'.slice(1, 3)"), "el");
  assert.equal(value("'abc'.padStart(5, '0')"), "00abc");
  assert.equal(value("'a'.repeat(3)"), "aaa");
  assert.equal(value("'2026'.startsWith('20')"), true);
  assert.equal(value("'1,2'.replace(',', '+')"), "1+2");
  assert.equal(value("'a-b'.replaceAll('-', '/')"), "a/b");
  assert.equal(value("(99.456).toFixed(1)"), "99.5");
  assert.equal(value("(1234.5).toLocaleString('en-US')"), "1,234.5");
  assert.equal(value("(255).toString(16)"), "ff");
  assert.equal(fallback("(12).toFixed?.('x')"), "<failed>");
});

test("safe builtins: Math, Number, String, Array", () => {
  assert.equal(value("Math.max(1, 4.5, 2)"), 4.5);
  assert.equal(value("Math.round(2.6)"), 3);
  assert.equal(value("Math.abs(-3)"), 3);
  assert.equal(value("Math.PI > 3"), true);
  assert.equal(value("Number('12') + 1"), 13);
  assert.equal(value("String(42)"), "42");
  assert.equal(value("String(1) + String(2)"), "12");
  assert.deepEqual(value("Array.from([1, 2]).map(x => x + 1)"), [2, 3]);
  assert.deepEqual(value("Array.from({ length: 3 })"), [0, 1, 2]);
  assert.deepEqual(value("Array.from({ length: 3 }, (_, i) => i * 2)"), [0, 2, 4]);
  assert.deepEqual(value("Array.from([4, 5], (v) => v + 1)"), [5, 6]);
  // A mapFn that is not an arrow is ignored, not called as a value.
  assert.deepEqual(value("Array.from({ length: 2 }, 7)"), [0, 1]);
  assert.equal(value("Array.isArray([])"), true);
});

test("block-bodied arrows run the #48 callback shape", () => {
  assert.equal(value("((x) => { const y = x * 2; return y + 1; })(3)"), 7);
  assert.deepEqual(
    value("items.map(m => { const p = m.p; return p > 97; })", {
      items: [{ p: 99 }, { p: 96 }],
    }),
    [true, false],
  );
  assert.equal(value("((x) => { x; })(1)"), undefined);
});

test("optional calls and trailing junk are handled", () => {
  assert.equal(value("m.missing?.()", { m: {} }), undefined);
  assert.equal(fallback("1 + 2 foo"), "<failed>");
  assert.equal(fallback("1, 2"), "<failed>");
  assert.equal(fallback("{ __proto__: 1 }"), "<failed>");
  assert.equal(fallback("(x = 1)"), "<failed>");
});

test("security: no globals, no prototype access, no assignment", () => {
  const escapes = [
    "window",
    "document",
    "globalThis",
    "process",
    "require",
    "fetch",
    "localStorage",
    "eval('1+1')",
    "Function('return 1')()",
    "constructor",
    "'x'.constructor",
    "({}).__proto__",
    "x = 1",
    "this",
    "new Date()",
    "a == b",
    "typeof a",
  ];
  for (const source of escapes) {
    assert.equal(fallback(source, { a: 1, b: 1 }), "<failed>", `expected ${source} to fail safely`);
  }
  assert.throws(() => value("x = 1"), DilEvaluationError);
  assert.equal(fallback("'a'.constructor('<img src=x onerror=alert(1)>')"), "<failed>");
});

test("security: unbounded work is refused", () => {
  assert.equal(fallback("'a'.repeat(999999999)"), "<failed>");
  assert.equal(value("Array.from({ length: 3 }).length"), 3);
  assert.deepEqual(
    fallback("Array.from({ length: 1e9 })"),
    Array.from({ length: 10000 }, (_, i) => i),
  );
  assert.equal(fallback("''.padEnd(1e9)"), "<failed>");
});

test("__dilSafe: streaming prefixes fall back quietly", () => {
  const prefixes = [
    "",
    "m.",
    "m.p.",
    "m.p.toFixed(",
    "items.map(",
    "items.map(m =>",
    "`${m.p",
    "1 +",
    "a ? b",
    "[1, 2",
    "{ name: 'x'",
    "Math.max(1,",
  ];
  for (const source of prefixes) {
    assert.equal(fallback(source, { m: { p: 1 }, items: [] }), "<failed>", `prefix ${JSON.stringify(source)}`);
  }
  assert.deepEqual(evaluateList("items.fi", { items: [] }), []);
  assert.equal(evaluateCondition("a &&", {}), false);
  assert.equal(evaluateCondition(null, {}), true);
  assert.deepEqual(evaluateList("[1, 2]", {}), [1, 2]);
  assert.deepEqual(evaluateList("'not a list'", {}), []);
});

test("evaluateStatements builds the render scope in order", () => {
  const scope = evaluateStatements([
    "const items = [{ name: 'a', p: 99.5 }, { name: 'b', p: 96.2 }]",
    "const total = items.length",
    "const label = `${total} 项`",
    "let best = items[0].p.toFixed(1)",
    "const [open, setOpen] = DIL.useState(false)",
    "const [step] = useState(2)",
    "const broken = items.map(",
  ]);
  assert.deepEqual(scope.items, [
    { name: "a", p: 99.5 },
    { name: "b", p: 96.2 },
  ]);
  assert.equal(scope.total, 2);
  assert.equal(scope.label, "2 项");
  assert.equal(scope.best, "99.5");
  assert.equal(scope.open, false);
  assert.equal(scope.step, 2);
  assert.equal(scope.broken, undefined);
  assert.equal(typeof scope.setOpen, "object"); // a no-op callable until #48
});

test("statements see the seeded scope and can use it", () => {
  const scope = evaluateStatements(["const n = base * 2", "const list = items.map(i => i + n)"], {
    base: 3,
    items: [1, 2],
  });
  assert.equal(scope.n, 6);
  assert.deepEqual(scope.list, [7, 8]);
});

test("formatValue is what the transcript shows", () => {
  assert.equal(formatValue("x"), "x");
  assert.equal(formatValue(1.5), "1.5");
  assert.equal(formatValue(true), "true");
  assert.equal(formatValue(null), "");
  assert.equal(formatValue(undefined), "");
  assert.equal(formatValue([1, "a"]), "1, a");
  assert.equal(formatValue({ a: 1 }), '{"a":1}');
  assert.equal(formatValue(Number.NaN), "");
  assert.equal(
    formatValue(() => 1),
    "",
  );
});

test("parsing is cached and stable across calls", () => {
  const scope = { items: [1, 2, 3] };
  const first = value("items.map(x => x * 2)", scope);
  const second = value("items.map(x => x * 2)", scope);
  assert.deepEqual(first, [2, 4, 6]);
  assert.deepEqual(second, [2, 4, 6]);
});

test("a nested call shares the running budget instead of restarting it", () => {
  // A functional setter's updater runs inside the handler that triggered it. If it started
  // a fresh budget, a handler could recurse through `setX(prev => …)` without ever hitting
  // the step limit; sharing it keeps the whole click inside one budget.
  const exhaust = "Array.from({ length: 10000 }).map((_, i) => [i, i + 1, i + 2].map((v) => v * 2).length).length";
  const nested = evaluateExpression("() => 42", {});
  assert.throws(() => evaluateExpression(exhaust), DilEvaluationError);
  assert.throws(() => callSafe(nested, [], { freshBudget: false }), /budget exceeded/);
  // The entry point itself still gets a fresh one.
  assert.equal(callSafe(nested), 42);
});

test("a handler invoked from outside gets its own evaluation budget", () => {
  // One document can burn the whole shared budget while rendering; the click that follows
  // must not inherit the exhausted counter, or a valid handler fails for a reason nothing
  // in the document explains. The entry point resets it, as `evaluateExpression` does.
  const handler = evaluateExpression("() => 42", {});
  assert.throws(
    () =>
      evaluateExpression(
        "Array.from({ length: 10000 }).map((_, i) => [i, i + 1, i + 2].map((v) => v * 2).length).length",
      ),
    DilEvaluationError,
    "the fixture must actually exhaust the budget",
  );
  assert.equal(callSafe(handler), 42);
});
