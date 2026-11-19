# Scenarios — what a DIL answer looks like, and what renders it

Twelve captured messages, one per feature set, kept because they are the clearest examples
of a DIL construct. Each directory holds the same three files, and each is also a
conformance case (`npm run test:conformance`), so nothing here can drift from what the
reference implementation produced:

| file | what it is |
| --- | --- |
| `<name>.dil.md` | the answer exactly as the model wrote it — Markdown and DIL mixed |
| `<name>.raw.js` | the JavaScript ChatGPT's server compiled that answer into (the oracle) |
| `<name>.data.json` | the client data for it: `constants`, `appData`, `view_state` |

Read them in that order: the `.dil.md` is what the model writes, the table below says which
primitives the renderer builds from it, and `src/web/src/components/dil/` is where each one
lives.

## The twelve

| scenario | what to look at | rendered primitives | source |
| --- | --- | --- | --- |
| `plain-list` | the minimum: a Markdown list from prose, no tags at all | `list`, `list-item` | 289 B |
| `comparison-table` | a Markdown table lowered into DIL cells, with inline emphasis | `table`, `table-row`, `table-cell` | 797 B |
| `layout-cards` | `grid` + `grid-item` cards with `badge`, `icon`, `caption`, `blockquote` | `grid`, `grid-item`, `badge`, `icon` | 1.2 KB |
| `code-and-table` | a fenced block next to a table, both from Markdown | `table`, `code-block` | 1.1 KB |
| `code-walkthrough` | prose interleaved with `box` sections and inline `code` | `box`, `code`, `list` | 2.0 KB |
| `diagram-and-code` | parametric `svg` (`rect`, `path`, `line`) beside a table and maths | `svg`, `rect`, `path`, `line` | 2.5 KB |
| `table-through-each` | `{#each}` over inline data driving a table body plus `grid` | `each` → `table-row`, `grid-item` | 3.3 KB |
| `explanation-with-code` | the densest layout usage: nested `box`/`row`, `icon`, five `Cite`s | `box`, `row`, `icon`, `code-block` | 3.2 KB |
| `conditional-reveal` | `{#if}` / `{#each}` written by hand, plus a table of framework syntax | control flow → `table` | 1.3 KB |
| `button-variants` | the only non-sending `button`, with `color` and `size` | `button`, `code` | 2.0 KB |
| `quiz-radio-reveal` | **interactive**: `DIL.useState` + `radio-group` + a button that reveals the answer with `{#if}` | `radio-group`, `radio`, `button` | 5.7 KB |
| `self-check-form` | **interactive + host action**: `radio-group`, `label`, `textarea`, and a `GenUI.issueNewTurn` submit | `controls`, `GenUI.issueNewTurn` | 4.0 KB |

The two interactive ones are the only samples in the corpus that carry state at all; they
are what `#48` is measured against. The event script each was recorded with is in
`conformance.test.ts` (`SCRIPTS`), so "the same events produce the same tree, the same
`GenUI` argument and the same state" is an assertion, not a claim.

## A note on `self-check-form`

Its prompt is a captured user's own report ("我使用小米 Pad 8 Pro …"), naming real product
models. It is kept byte-for-byte because the conformance check compares the exact argument
`GenUI.issueNewTurn` receives; rewriting it would silently weaken the oracle. It contains no
account, address or credential — only device model names — and it is the only sample with a
host action.

## What is *not* here

The corpus also holds 37 further DIL messages in `conformance/corpus/`, kept for breadth
rather than for reading, and prose-only answers are not kept at all. If you are looking for
"which behaviour is the dialect's, and which is ours", start with `conformance/README.md`.
