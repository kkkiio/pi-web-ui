# Conformance — the reference implementation is the oracle

DIL is not ours to design. It is a dialect OpenAI's client already implements, and the
repository would otherwise have no way to tell "our dialect behaviour" from "the dialect's
behaviour": our unit tests can only prove that the renderer matches what we decided.

This directory removes that freedom. Every sample carries three files captured from the
reference client:

| file | what it is |
| --- | --- |
| `<id>.source.md` | the DIL source the model wrote |
| `<id>.raw.js` | the JavaScript ChatGPT's server compiled that source into |
| `<id>.data.json` | the data the client supplied: `constants`, `appData`, `view_state` |

`raw.js` is a **closed program** — its only free variables are `DIL`, `__dil`,
`__dilSafe`, `GenUI`, and five host components — so it runs in Node against a shim
(`reference.ts`). Those three files together are an executable oracle:

```
reference: run raw.js  ──┐
                         ├─ canonical projection (@see canonical.ts) ── diff ── pass/fail
ours:      parse+resolve ┘
```

## What is compared

| projection | why it is observable |
| --- | --- |
| render structure + text | what the reader sees |
| state-carrying control props (`value`, `direction`, `placeholder`, `rows`, `block`, `color`, `size`) | the `#48` surface |
| host actions (`GenUI.issueNewTurn` arguments) | exactly the text the next turn receives |
| state slots (`view_state` keys and values) | the only "state" the reference publishes |

Subtrees one side resolves through its client and the other renders inline are dropped from
**both** sides and counted — a captured program never contains the inside of a code block, so
claiming agreement there would be dishonest. `canonical.ts` keeps that list explicit.

## What is *not* compared, and cannot be

The corpus is thin where interaction lives: **2 of 76 samples** carry `DIL.useState`, and
neither writes a slot and then reads it in the same handler. Behaviour the samples never
exercise has no oracle here. Two things exist for that gap:

- `known-differences.json` — every sample that does not conform yet, with the first
  difference, reviewed by hand. `UPDATE_CONFORMANCE=1 npm run test:conformance` rewrites it;
  a review of the diff is the point, not the rewrite.
- `derived.test.ts` — probes that express the reference's **semantics** in the same shape
  the compiler emits (a real `const` per state slot, a setter that re-runs the program) and
  run them through the same shim. They are labelled derived because they are written here,
  not captured: they can only claim what follows from the compiled shape.

## Adding a sample

Copy the three files into `samples/`, run `UPDATE_CONFORMANCE=1 npm run test:conformance`,
and review every line of the new `known-differences.json` entry. A sample that only conforms
because everything was dropped is a bug in the comparison, not a result.

## Provenance

`samples/` is third-party captured output, kept only as test fixtures; see `NOTICE.md`.
