/**
 * Conformance against the reference implementation — the corpus is the oracle.
 *
 * Every sample ships three files: the DIL source the model wrote (`*.source.md`), the
 * JavaScript ChatGPT's server compiled it into (`*.raw.js`), and the data the client
 * supplied (`*.data.json`, including the state the user left behind). `reference.ts` runs
 * that program; `ours.ts` runs the shipped renderer on the source; `canonical.ts` reduces
 * both to the same projection. A difference is a failing test, not a paragraph in a doc.
 *
 * Two limits are part of the design, not accidents:
 *
 *   - **Only comparable things are compared.** The reference hands rich leaves to client
 *     widgets (a captured program never contains the inside of a code block), and it ships
 *     components we do not render. Those subtrees are dropped from *both* sides and
 *     counted in `skipped`, so a sample can never look aligned by having everything
 *     dropped.
 *   - **The corpus bounds the questions we can ask.** Only two samples are interactive,
 *     so behaviour the samples never exercise has no oracle here; that is what
 *     `known-differences.json` and the derived probes exist for.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeReference, canonicalizeResolved, firstDifference, signatures } from "./canonical.ts";
import { createOurProgram, type OurProgram } from "./ours.ts";
import { createReferenceProgram, type ReferenceProgram, type SampleData } from "./reference.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "samples");
const knownFile = join(here, "known-differences.json");
const update = process.env.UPDATE_CONFORMANCE === "1";

interface Sample {
  readonly name: string;
  readonly source: string;
  readonly code: string;
  readonly data: SampleData;
}

function samples(): Sample[] {
  const names = readdirSync(sampleDir)
    .filter((name) => name.endsWith(".source.md"))
    .map((name) => name.replace(/\.source\.md$/, ""))
    .sort();
  return names.map((name) => ({
    name,
    source: readFileSync(join(sampleDir, `${name}.source.md`), "utf8"),
    code: readFileSync(join(sampleDir, `${name}.raw.js`), "utf8"),
    data: JSON.parse(readFileSync(join(sampleDir, `${name}.data.json`), "utf8")) as SampleData,
  }));
}

/** The first place the two renderings of one sample disagree, or `null` when they agree. */
function staticDifference(sample: Sample): string | null {
  const reference = createReferenceProgram(sample.code, sample.data);
  const ours = createOurProgram(sample.source);
  const expected = canonicalizeReference(reference.render());
  const actual = canonicalizeResolved(ours.render());
  return firstDifference(signatures(expected), signatures(actual));
}

/**
 * Samples whose captured source and captured program disagree (corpus drift), or where the
 * renderer legitimately differs. Reviewed by hand; `UPDATE_CONFORMANCE=1` rewrites it.
 */
const known: Record<string, string> = update || !exists() ? {} : JSON.parse(readFileSync(knownFile, "utf8"));
function exists(): boolean {
  try {
    readFileSync(knownFile);
    return true;
  } catch {
    return false;
  }
}

test("the corpus renders the same as its captured program", () => {
  const actual: Record<string, string> = {};
  const all = samples();
  for (const sample of all) {
    const difference = staticDifference(sample);
    if (difference) actual[sample.name] = difference;
  }

  if (update) {
    writeFileSync(knownFile, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }

  const unexpected = Object.entries(actual).filter(([name, difference]) => known[name] !== difference);
  const resolved = Object.keys(known).filter((name) => !actual[name]);
  const messages = [
    ...unexpected.map(([name, difference]) => `${name}:\n${difference}`),
    ...resolved.map((name) => `${name}: aligned now — remove it from known-differences.json`),
  ];
  assert.equal(
    messages.length,
    0,
    `${messages.join("\n\n")}\n\nReview, then UPDATE_CONFORMANCE=1 npm run test:conformance`,
  );
});

// ---------------------------------------------------------------------------
// Interaction: the two samples that carry state (`#48`)
// ---------------------------------------------------------------------------

/** The event script each interactive sample was recorded with, in user order. */
const SCRIPTS: Record<string, readonly ScriptedEvent[]> = {
  // `L08-M5`: a quiz. The captured `view_state` is `{choice: "B", revealed: true}`, i.e. the
  // user answered and pressed "检查答案".
  "L08-M5": [
    { kind: "change", tag: "radio-group", value: "C" },
    { kind: "click", tag: "button" },
  ],
  // `L12-M24`: the MIDI self-check. Pick a result, add a note, submit.
  "L12-M24": [
    { kind: "change", tag: "radio-group", value: "nodevice" },
    { kind: "change", tag: "textarea", value: "USB MIDI 列表为空" },
    { kind: "click", tag: "button" },
  ],
};

type ScriptedEvent =
  | { readonly kind: "change"; readonly tag: string; readonly value: unknown }
  | { readonly kind: "click"; readonly tag: string };

interface Interaction {
  readonly reference: ReferenceProgram;
  readonly ours: OurProgram;
}

function interaction(sample: Sample): Interaction {
  return {
    reference: createReferenceProgram(sample.code, sample.data),
    ours: createOurProgram(sample.source),
  };
}

/** Drive the same event through both sides, then report the projection each produced. */
function replay({ reference, ours }: Interaction, events: readonly ScriptedEvent[], step: number): void {
  const event = events[step];
  assert.ok(event, `event ${step} is missing from the script`);
  if (event.kind === "change") {
    assert.ok(ours.change(event.tag, event.value), `our tree has no <${event.tag}> to change`);
    reference.change(event.tag, event.value);
    return;
  }
  assert.ok(ours.click(event.tag), `our tree has no <${event.tag}> to click`);
  reference.click(event.tag);
}

for (const [name, events] of Object.entries(SCRIPTS)) {
  test(`${name}: the same events produce the same tree, effects and state`, () => {
    const sample = samples().find((candidate) => candidate.name === name);
    assert.ok(sample, `${name} is missing from conformance/samples`);
    const run = interaction(sample);

    for (const [step] of events.entries()) {
      replay(run, events, step);
      assert.equal(
        firstDifference(
          signatures(canonicalizeReference(run.reference.render())),
          signatures(canonicalizeResolved(run.ours.render())),
        ),
        null,
        `${name}: render differs after event ${step + 1} (${events[step]?.kind} ${events[step]?.tag})`,
      );
    }

    const effects = (side: { effects(): readonly { name: string; args: readonly unknown[] }[] }) =>
      side.effects().map((effect) => `${effect.name}(${effect.args.map((arg) => JSON.stringify(arg)).join(", ")})`);
    assert.deepEqual(effects(run.ours), effects(run.reference), `${name}: host actions differ`);
    assert.deepEqual(run.ours.state(), run.reference.state(), `${name}: state slots differ`);
  });
}

test("the captured view_state is a restore the renderer does not do yet", () => {
  // `L08-M5` was captured *after* the user answered: the reference reopens it answered.
  // Our renderer starts from the declared initial values, so this asserts the gap exists
  // rather than pretending it does not. Delete this test when restore lands.
  const sample = samples().find((candidate) => candidate.name === "L08-M5");
  assert.ok(sample);
  const restored = createReferenceProgram(sample.code, sample.data, { seedViewState: true });
  assert.deepEqual(restored.state(), { choice: "B", revealed: true });

  const fresh = createOurProgram(sample.source);
  assert.notDeepEqual(fresh.state(), restored.state());
});
