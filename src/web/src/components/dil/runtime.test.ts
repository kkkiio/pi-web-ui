import assert from "node:assert/strict";
import test from "node:test";
import { type DilScope, safeEvaluate } from "../../core/dil/evaluator.ts";
import { collectStatements, evaluateStatements, parseDocument } from "../../core/dil/index.ts";
import { type ResolvedNode, type ResolvedProps, resolveNodes } from "./resolve.ts";
import { type DilHost, DilRuntime } from "./runtime.ts";

/**
 * The interaction runtime, tested without React: the renderer's `bump` is a counter here,
 * which is all the runtime knows about re-rendering.
 */

interface Harness {
  readonly runtime: DilRuntime;
  readonly bumps: () => number;
  readonly sent: string[];
}

function harness(host: Partial<DilHost> | null = {}): Harness {
  let bumps = 0;
  const sent: string[] = [];
  const runtime = new DilRuntime(
    () => {
      bumps += 1;
    },
    () =>
      host === null
        ? null
        : {
            issueNewTurn: (prompt: string) => {
              sent.push(prompt);
            },
            busy: false,
            ...host,
          },
  );
  return { runtime, bumps: () => bumps, sent };
}

/** One render pass: `{@body}` scope, state bound onto it, then control-flow expansion. */
function render(
  source: string,
  runtime: DilRuntime,
  { isStreaming = false }: { isStreaming?: boolean } = {},
): { scope: DilScope; nodes: ResolvedNode[] } {
  const document = parseDocument(source, { isStreaming });
  const scope = evaluateStatements(collectStatements(document.raw), runtime.seed(), {
    useState: runtime.useState,
  });
  runtime.bindState(scope, document.state);
  return { scope, nodes: resolveNodes(document.tree, scope) };
}

/** The resolved props a control receives — what `renderNode` hands the component. */
function propsOf(nodes: readonly ResolvedNode[], name: string): ResolvedProps {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    if (node.name === name) return node.props;
    const nested = propsOf(node.children, name);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

function textOf(nodes: readonly ResolvedNode[]): string {
  return nodes.map((node) => (node.kind === "text" ? node.value : textOf(node.children))).join("");
}

const QUIZ = [
  '{@body const [choice, setChoice] = DIL.useState("B", { key: "choice" })}',
  "{@body const [revealed, setRevealed] = DIL.useState(false)}",
  "<button onClick={() => { setChoice('C'); setRevealed(true) }}>check</button>",
].join("\n");

test("a setter writes its slot, bumps once, and a re-render sees the new value", () => {
  const { runtime, bumps } = harness();
  const first = render(QUIZ, runtime);
  assert.equal(first.scope.choice, "B");

  runtime.invoke(first.scope.setChoice, ["C"]);
  assert.equal(bumps(), 1, "the setter asks the renderer to re-render once");

  const second = render(QUIZ, runtime);
  assert.equal(second.scope.choice, "C");
  assert.equal(second.scope.revealed, false, "only the written slot changes");
});

test("setting the current value again does not re-render", () => {
  const { runtime, bumps } = harness();
  const { scope } = render(QUIZ, runtime);
  runtime.invoke(scope.setChoice, ["B"]);
  assert.equal(bumps(), 0);
});

test("a getter keeps a handler's later reads live, not snapshotted", () => {
  const { runtime } = harness();
  const source = [
    "{@body const [n, setN] = DIL.useState(1)}",
    "<button onClick={() => { setN(2); last = n }}>go</button>",
  ].join("\n");
  const { scope } = render(source, runtime);
  // `const last` would be snapshotted; the slot is read through a getter, so the same
  // handler sees its own write — `onChange={v => { setX(v); log(x) }}` depends on it.
  runtime.invoke(scope.setN, [7]);
  assert.equal(scope.n, 7);
});

test("an array-pattern state without a setter still binds its value", () => {
  const { runtime } = harness();
  const { scope } = render("{@body const [only] = DIL.useState('x')}<text>{only}</text>", runtime);
  assert.equal(scope.only, "x");
});

test("a constant derived from state follows the slot", () => {
  const { runtime } = harness();
  const source = [
    "{@body const [seats, setSeats] = DIL.useState(8)}",
    "{@body const price = seats * 29}",
    "<text>{price}</text>",
  ].join("\n");
  const first = render(source, runtime);
  assert.equal(textOf(first.nodes), "232");
  runtime.invoke(first.scope.setSeats, [10]);
  // The reference dialect's own example: a derived constant must not freeze at the initial
  // value just because `evaluateStatements` re-runs on every resolve.
  assert.equal(textOf(render(source, runtime).nodes), "290");
});

test("the explicit { key } wins over the variable name", () => {
  const document = parseDocument('{@body const [tab, setTab] = DIL.useState("a", { key: "tabs" })}', {
    isStreaming: false,
  });
  assert.deepEqual(document.state, [{ name: "tab", setter: "setTab", initial: '"a"', key: "tabs" }]);
});

test("state declared without a key falls back to its variable name", () => {
  const document = parseDocument("{@body const [open, setOpen] = DIL.useState(false)}", { isStreaming: false });
  assert.deepEqual(document.state, [{ name: "open", setter: "setOpen", initial: "false" }]);
});

test("control flow re-evaluates against a slot written by a handler", () => {
  const { runtime } = harness();
  const source = [
    "{@body const [open, setOpen] = DIL.useState(false)}",
    "<button onClick={() => setOpen(true)}>open</button>",
    "{#if open}<text>revealed</text>{:else}<text>hidden</text>{/if}",
  ].join("\n");
  const first = render(source, runtime);
  assert.equal(textOf(first.nodes), "openhidden");
  runtime.invoke(propsOf(first.nodes, "button").onClick);
  const second = render(source, runtime);
  assert.equal(textOf(second.nodes), "openrevealed");
});

test("the probe reports the action a handler would perform, and performs nothing", () => {
  const { runtime, bumps, sent } = harness();
  const source = [
    '{@body const [choice, setChoice] = DIL.useState("B")}',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: `${choice}` is DIL source, not a JS template
    "<button onClick={() => { setChoice('C'); GenUI.issueNewTurn(`picked ${choice}`) }}>send</button>",
  ].join("\n");
  const { nodes } = render(source, runtime);
  const action = runtime.probe(propsOf(nodes, "button").onClick);
  // The probe runs the real handler: the template says "picked B", the pre-click value.
  assert.deepEqual(action, { kind: "issueNewTurn", text: "picked B" });
  assert.equal(sent.length, 0, "probing sends nothing");
  assert.equal(bumps(), 0, "probing writes no state");
});

test("the probe returns null for a handler that only touches local state", () => {
  const { runtime, bumps } = harness();
  const { nodes } = render(
    "{@body const [open, setOpen] = DIL.useState(false)}<button onClick={() => setOpen(true)}>x</button>",
    runtime,
  );
  assert.equal(runtime.probe(propsOf(nodes, "button").onClick), null);
  assert.equal(bumps(), 0);
});

test("a real click sends the prompt built from the current state", () => {
  const { runtime, sent } = harness();
  const source = [
    '{@body const [choice, setChoice] = DIL.useState("B")}',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: `${choice}` is DIL source, not a JS template
    "<button onClick={() => GenUI.issueNewTurn(`picked ${choice}`)}>send</button>",
  ].join("\n");
  const first = render(source, runtime);
  runtime.invoke(first.scope.setChoice, ["C"]);
  const second = render(source, runtime);
  runtime.invoke(propsOf(second.nodes, "button").onClick);
  assert.deepEqual(sent, ["picked C"]);
});

test("invoke returns the host promise so a control can show a sending state", async () => {
  let resolve: () => void = () => {};
  const runtime = new DilRuntime(
    () => {},
    () => ({ issueNewTurn: () => new Promise<void>((done) => (resolve = done)), busy: false }),
  );
  const { nodes } = render("<button onClick={() => GenUI.issueNewTurn('go')}>x</button>", runtime);
  const dispatched = runtime.invoke(propsOf(nodes, "button").onClick);
  assert.ok(dispatched instanceof Promise);
  resolve();
  await dispatched;
});

test("a radio-group handler receives the selected value, not an event", () => {
  const { runtime } = harness();
  const source = [
    '{@body const [choice, setChoice] = DIL.useState("A")}',
    '<radio-group value={choice} onChange={setChoice}><radio value="A">a</radio></radio-group>',
  ].join("\n");
  const first = render(source, runtime);
  runtime.invoke(propsOf(first.nodes, "radio-group").onChange, ["A2"]);
  const second = render(source, runtime);
  assert.equal(propsOf(second.nodes, "radio-group").value, "A2");
});

test("a functional setter derives from the previous value", () => {
  const { runtime } = harness();
  const { scope } = render("{@body const [n, setN] = DIL.useState(1)}", runtime);
  // `setN(prev => prev + 1)`: an arrow argument is an updater, as in the reference runtime.
  runtime.invoke(scope.setN, [safeEvaluate("(prev) => prev + 1", {}, undefined)]);
  assert.equal(scope.n, 2);
});

test("issueNewTurn rejects a non-string or empty prompt", () => {
  const { runtime, sent } = harness();
  const handler = runtime.seed().GenUI as { members: Map<string, unknown> };
  const issue = handler.members.get("issueNewTurn") as { invoke: (args: unknown[]) => unknown };
  assert.throws(() => issue.invoke([42]));
  assert.throws(() => issue.invoke(["   "]));
  assert.equal(sent.length, 0);
});

test("without a host the probe still reports the action, and a click does nothing", () => {
  const { runtime } = harness(null);
  const { nodes } = render("<button onClick={() => GenUI.issueNewTurn('go')}>x</button>", runtime);
  assert.deepEqual(runtime.probe(propsOf(nodes, "button").onClick), { kind: "issueNewTurn", text: "go" });
  // The control disables the button in this state; if it is clicked anyway, the failure
  // stays inside the runtime (`invoke` never throws into the transcript).
  assert.equal(runtime.invoke(propsOf(nodes, "button").onClick), null);
});

test("rendering is not consent: no dispatch outside a control interaction", () => {
  const { runtime, sent } = harness();
  // A `{@body}` initialiser and an interpolation both evaluate while drawing the message.
  const source = [
    "{@body const ignored = GenUI.issueNewTurn('from a statement')}",
    "<text>{GenUI.issueNewTurn('from an expression')}</text>",
  ].join("\n");
  const { nodes } = render(source, runtime);
  assert.equal(sent.length, 0, "drawing the message must not send anything");
  // The broken interpolation renders as nothing instead of taking the answer down.
  assert.equal(textOf(nodes), "");
});

test("a declaration that is still streaming does not pin its slot to undefined", () => {
  const { runtime } = harness();
  // Streaming cut inside the call: `document.state` already reports `n`, but the statement
  // cannot be evaluated yet. Seeding from it would pin the slot to `undefined` and the
  // completed declaration would never be able to supply the real initial value.
  render("{@body const [n, setN] = DIL.useState(\n", runtime, { isStreaming: true });
  const complete = render("{@body const [n, setN] = DIL.useState(5)}", runtime);
  assert.equal(complete.scope.n, 5);
});

test("a handler inside an {#each} still reads live state", () => {
  const { runtime, sent } = harness();
  const source = [
    '{@body const [choice, setChoice] = DIL.useState("B")}',
    "{#each [1, 2] as i}",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: `${…}`-free; `choice` is DIL, not JS
    '<button onClick={() => { setChoice("C"); GenUI.issueNewTurn(choice) }}>send</button>',
    "{/each}",
  ].join("\n");
  const { nodes } = render(source, runtime);
  // An iteration scope must share the state getters: a spread would snapshot them and the
  // same handler would submit the value from *this* render instead of what it just wrote.
  runtime.invoke(propsOf(nodes, "button").onClick);
  assert.deepEqual(sent, ["C"]);
});

test("rendering cannot write state either", () => {
  const { runtime, bumps } = harness();
  const source = [
    "{@body const [n, setN] = DIL.useState(0)}",
    "<text>{setN(n + 1)}</text>",
    "<button onClick={() => setN(n + 1)}>bump</button>",
  ].join("\n");
  const first = render(source, runtime);
  assert.equal(bumps(), 0, "an interpolation must not write");
  // `onClick={setN(n + 1)}` is an attribute value, not a handler: it is evaluated on the
  // render path, so it must not write either — the button itself still works.
  runtime.invoke(propsOf(first.nodes, "button").onClick);
  assert.equal(bumps(), 1);
});

test("a click still dispatches after the render guard", () => {
  const { runtime, sent } = harness();
  const { nodes } = render("<button onClick={() => GenUI.issueNewTurn('clicked')}>x</button>", runtime);
  runtime.invoke(propsOf(nodes, "button").onClick);
  assert.deepEqual(sent, ["clicked"]);
});

test("one broken handler never takes the transcript down", () => {
  const { runtime } = harness();
  const { nodes } = render("<button onClick={() => missing.property}>x</button>", runtime);
  assert.equal(runtime.probe(propsOf(nodes, "button").onClick), null);
  assert.equal(runtime.invoke(propsOf(nodes, "button").onClick), null);
});
