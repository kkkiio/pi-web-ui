/**
 * Derived probes: the reference's *semantics*, where the corpus is silent.
 *
 * Only two captured samples carry state, and neither writes a slot and then reads it in the
 * same handler. The behaviour of that case is still not ours to choose — it follows from
 * what the compiler emits, which is ordinary JavaScript:
 *
 *     const [choice, setChoice] = DIL.useState("B", { key: "choice" })
 *     __dil.jsx("button", { onClick: () => { setChoice("C"); GenUI.issueNewTurn(choice) } })
 *
 * `choice` is a `const` of the render that created the handler, so the handler sends `B`.
 * These programs are **derived**, not captured: they are written here to express the
 * reference's documented runtime (`useState` returns a value pair, a setter re-runs the
 * program) in the same shape the compiler emits, and they run through the same shim as the
 * captured artifacts. Anything a probe claims must be visible in that shape.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createOurProgram } from "./ours.ts";
import { createReferenceProgram } from "./reference.ts";

/**
 * No host bridge here: `GenUI` effects are recorded by the shim, which is what the probe
 * compares. A handler that fires during `render()` would be recorded before any click.
 */
interface ProbeCase {
  readonly name: string;
  /** DIL source, as the model writes it. */
  readonly source: string;
  /** The program the compiler emits for it, in the captured shape. */
  readonly program: string;
  /** The control a user touches, and the event. */
  readonly act: { readonly tag: string; readonly kind: "click" | "change"; readonly value?: unknown };
}

const CASES: readonly ProbeCase[] = [
  {
    name: "a handler that writes then reads inside one click",
    source: [
      '{@body const [choice, setChoice] = DIL.useState("B", { key: "choice" })}',
      '<button onClick={() => { setChoice("C"); GenUI.issueNewTurn(choice) }}>send</button>',
    ].join("\n"),
    program: `DIL.render(__dil.jsx(()=>{
      const [choice, setChoice] = DIL.useState("B", { key: "choice" });
      return __dil.jsx("button", { onClick: () => { setChoice("C"); GenUI.issueNewTurn(choice); } }, "send");
    }, { key: "body:0" }));`,
    act: { tag: "button", kind: "click" },
  },
  {
    name: "a handler inside an {#each} that writes then reads",
    source: [
      '{@body const [choice, setChoice] = DIL.useState("B", { key: "choice" })}',
      "{#each [1, 2] as i}",
      '<button onClick={() => { setChoice("C"); GenUI.issueNewTurn(choice) }}>send</button>',
      "{/each}",
    ].join("\n"),
    program: `DIL.render(__dil.jsx(()=>{
      const [choice, setChoice] = DIL.useState("B", { key: "choice" });
      return [1, 2].map((i) => __dil.jsx("button", {
        onClick: () => { setChoice("C"); GenUI.issueNewTurn(choice); },
        key: i,
      }, "send"));
    }, { key: "body:0" }));`,
    act: { tag: "button", kind: "click" },
  },
];

for (const probe of CASES) {
  test(`derived: ${probe.name}`, () => {
    const reference = createReferenceProgram(probe.program, {});
    const ours = createOurProgram(probe.source);

    if (probe.act.kind === "click") {
      assert.ok(reference.click(probe.act.tag), "reference has no such control");
      assert.ok(ours.click(probe.act.tag), "our renderer has no such control");
    } else {
      assert.ok(reference.change(probe.act.tag, probe.act.value), "reference has no such control");
      assert.ok(ours.change(probe.act.tag, probe.act.value), "our renderer has no such control");
    }

    const summarize = (side: { effects(): readonly { name: string; args: readonly unknown[] }[] }) =>
      side.effects().map((effect) => `${effect.name}(${effect.args.map((arg) => JSON.stringify(arg)).join(", ")})`);
    assert.deepEqual(summarize(ours), summarize(reference), `${probe.name}: host actions differ`);
    assert.deepEqual(ours.state(), reference.state(), `${probe.name}: state slots differ`);
  });
}
