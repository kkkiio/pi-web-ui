# Conformance — the reference implementation is the oracle

DIL is a delivered dialect, not ours to design. Without an oracle, our unit tests can only
prove the renderer matches what *we* decided — which is how an invented semantic once got in
and survived four review rounds.

This directory exists to **constrain semantics**, not to mirror the corpus. Two captured
messages carry `DIL.useState` and a host action; they are the only place in the corpus where
the dialect's runtime behaviour is observable, so they are the only ones vendored here:

| scenario | what it is |
| --- | --- |
| `quiz-radio-reveal` | a quiz: `radio-group` writes state, a button reveals the answer through `{#if}` |
| `self-check-form` | a self-check: `radio-group` + `label` + `textarea` + a `GenUI.issueNewTurn` submit |

Each is a directory with three captured files:

| file | what it is |
| --- | --- |
| `<name>.dil.md` | the DIL source the model wrote — Markdown and DIL mixed, as always |
| `<name>.raw.js` | the JavaScript ChatGPT's server compiled that source into |
| `<name>.data.json` | the data the client supplied: `constants`, `appData`, `view_state` |

One deliberate edit: in `self-check-form`, the user's own device model names are replaced
by generic terms (tablet, MIDI keyboard) **in all three files**, so both sides of the
comparison still agree. Nothing about the semantics depends on the brand.

`raw.js` is a **closed program** — its only free variables are `DIL`, `__dil`, `__dilSafe`,
`GenUI`, and five host components — so it runs in Node against a shim (`reference.ts`). Those
three files together are an executable oracle:

```
reference: run raw.js        ──┐
                               ├─ canonical projection (canonical.ts) ── diff ── pass/fail
ours:      compile + run DIL  ──┘
```

The compiled-artifact check runs both JS programs and their data in the same reference
environment. It compares the rendered card, state, and host actions before and after
each recorded user event.

## What is compared

| projection | why it is observable |
| --- | --- |
| render structure + text | what the reader sees |
| state-carrying control props (`value`, `direction`, `placeholder`, `rows`, `block`, `color`, `size`) | the `#48` surface |
| host actions (`GenUI.issueNewTurn` arguments) | exactly the text the next turn receives |
| state slots (`view_state` keys and values) | the only "state" the reference publishes |

Each interactive sample is replayed through the same event script (`SCRIPTS` in
`conformance.test.ts`), then all four projections are compared. A subtree one side resolves
through its client and the other renders inline is dropped from **both** sides and counted —
a captured program never contains the inside of a code block, so claiming agreement there
would be dishonest.

## What it does *not* cover, on purpose

- **Static rendering** (layout, tables, SVG, prose lowering). Those have their own unit
  fixtures and snapshots, and two samples would not make a meaningful net anyway.
- **Behaviour the two samples never exercise.** They are not thin air, though: a handler that
  writes a slot and then reads it never appears in them, which is exactly the semantic that
  was invented here. `derived.test.ts` covers it by expressing the reference's runtime in the
  shape the compiler emits (a real `const` per slot, a setter that re-runs the program) and
  running that through the same shim. Those probes are labelled derived because they are
  written here, not captured — they can only claim what follows from the compiled shape.
- `known-differences.json` stays as the reviewed escape hatch, and is empty today.

## Adding a scenario

Create `scenarios/<name>/` with the three files, then run
`UPDATE_CONFORMANCE=1 npm run test:conformance` and review every line of the new
`known-differences.json` entry. A sample that only conforms because everything was dropped is
a bug in the comparison, not a result.
