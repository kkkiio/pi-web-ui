# Conformance — the reference implementation is the oracle

DIL is a delivered dialect, not ours to design. Without an oracle, our unit tests can only
prove the renderer matches what *we* decided — which is how an invented semantic once got in
and survived four review rounds.

Each scenario is a captured message in three files:

| file | what it is |
| --- | --- |
| `<name>.dil.md` | the DIL source the model wrote — Markdown and DIL mixed, as always |
| `<name>.raw.js` | the JavaScript ChatGPT's server compiled that source into |
| `<name>.data.json` | the data the client supplied: `constants`, `appData`, `view_state` |

`raw.js` is a **closed program** — its only free variables are `DIL`, `__dil`,
`__dilSafe`, `GenUI`, and five host components — so it runs in Node against a shim
(`reference.ts`). Those three files together are an executable oracle:

```
reference: run raw.js  ──┐
                         ├─ canonical projection (canonical.ts) ── diff ── pass/fail
ours:      parse+resolve ┘
```

## The scenarios

One directory per feature set. `npm run test:conformance` runs all of them, so this table
cannot drift from what the reference produced.

| scenario | what to look at | rendered primitives |
| --- | --- | --- |
| `plain-list` | the minimum: a Markdown list from prose, no tags at all | `list`, `list-item` |
| `comparison-table` | a Markdown table lowered into DIL cells, with inline emphasis | `table`, `table-row`, `table-cell` |
| `layout-cards` | `grid` + `grid-item` cards with `badge`, `icon`, `caption`, `blockquote` | `grid`, `grid-item`, `badge`, `icon` |
| `code-and-table` | a fenced block next to a table, both from Markdown | `table`, `code-block` |
| `code-walkthrough` | prose interleaved with `box` sections and inline `code` | `box`, `code`, `list` |
| `diagram-and-code` | parametric `svg` (`rect`, `path`, `line`) beside a table and maths | `svg`, `rect`, `path`, `line` |
| `table-through-each` | `{#each}` over inline data driving a table body plus `grid` | `{#each}` → `table-row`, `grid-item` |
| `explanation-with-code` | the densest layout usage: nested `box`/`row`, `icon`, five `Cite`s | `box`, `row`, `icon`, `code-block` |
| `conditional-reveal` | `{#if}` / `{#each}` written by hand, plus a table of framework syntax | control flow → `table` |
| `button-variants` | the only non-sending `button`, with `color` and `size` | `button`, `code` |
| `quiz-radio-reveal` | **interactive**: `DIL.useState` + `radio-group` + a button that reveals the answer with `{#if}` | `radio-group`, `radio`, `button` |
| `self-check-form` | **interactive + host action**: `radio-group`, `label`, `textarea`, and a `GenUI.issueNewTurn` submit | controls, `GenUI.issueNewTurn` |

The two interactive ones are the only samples that carry state; they are what `#48` is
measured against. The event script each was recorded with is `SCRIPTS` in
`conformance.test.ts`, so "the same events produce the same tree, the same `GenUI` argument
and the same state" is an assertion, not a claim.

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

The samples are thin where interaction lives: two of twelve carry `DIL.useState`, and neither
writes a slot and then reads it in the same handler. Behaviour the samples never exercise has
no oracle here. Two things exist for that gap:

- `known-differences.json` — every scenario that does not conform yet, with the first
  difference, reviewed by hand. `UPDATE_CONFORMANCE=1 npm run test:conformance` rewrites it;
  the review of that diff is the point, not the rewrite.
- `derived.test.ts` — probes that express the reference's **semantics** in the same shape the
  compiler emits (a real `const` per state slot, a setter that re-runs the program) and run
  them through the same shim. They are labelled derived because they are written here, not
  captured: they can only claim what follows from the compiled shape.

## Adding a scenario

Create `scenarios/<name>/` with the three files, then run
`UPDATE_CONFORMANCE=1 npm run test:conformance` and review every line of the new
`known-differences.json` entry. A sample that only conforms because everything was dropped is
a bug in the comparison, not a result.
