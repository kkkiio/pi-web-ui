# DIL evals — can the model write a UI instead of a wall of prose?

Five prompts, each a real coding-agent pain point, scored by **parsing the answer** and
checking the structure it asked for. Four must produce a specific DIL shape; the fifth is
a negative control that must stay plain Markdown (over-triggering is a failure too).

The cases are the benchmark design from the DIL research notes: *relational flow*,
*spatial comparison*, *quantitative proportions*, *state taxonomy*, and *restraint*. Each
case carries its prompt, the DIL it hopes for, why Markdown alone loses, and the checks
that decide pass/fail — see [`cases.ts`](./cases.ts).

## Why not `@earendil-works/pi-evals`

That package is `private: true` in the Pi monorepo, so it cannot be installed here, and its
harness boots a full coding-agent session (system prompt, tools, Docker images) to measure
*Pi*. Our question is narrower — "does this model emit parseable DIL for this prompt?" — so
this directory borrows the shape (case list → harness → deterministic checks → optional
judge) and nothing else:

- generation goes through `@earendil-works/pi-ai`, the same model runtime Pi uses;
- scoring goes through `parseDocument` from `src/web/src/core/dil`, so a pass means the
  DIL really parsed, not that a judge liked it;
- `scoring.test.ts` proves the checks with hand-written ideal answers, so the suite works
  offline and a check that can never pass fails loudly.

## Run

```bash
npm run eval:dil                              # live, deepseek-flash, DIL system prompt
npm run eval:dil -- --variant both            # also run without the prompt (lift)
npm run eval:dil -- --model deepseek-v4-pro --runs 3
npm run eval:dil -- --dry                     # score the committed recordings
npm run eval:dil -- --record                  # refresh the recordings from a live run
npm run eval:dil -- flow comparison           # selected cases only
```

Credentials, in order: `<PROVIDER>_API_KEY` in the environment, the same name in a repo
`.env`, then `~/.pi/agent/auth.json` (what `pi` login writes). API-key providers only —
OAuth providers such as `openai-codex` need to be refreshed by Pi itself.

Each run prints a table and writes `report.json` (gitignored). Recordings under
[`recordings/`](./recordings) are committed so `--dry` and the scorer tests run without a
key.

## Scoring

`scoring.ts` walks the AST and evaluates labelled checks: tag presence and counts,
nesting, attributes (`columns={3}`, `width={…%}`, `tabularNums`), `{#each}` bodies, code
fences, word budget, and a clean-parse requirement. Shape-specific hopes (a `<row>` of
`<icon>`s) are expressed as `either(…)`/`anyTag(…)` so an equally good layout is not
punished for choosing different tags.

The negative control passes only with **zero** DIL elements and one code fence.

## Results (2026-11-18, `deepseek-flash`, 1 run per case)

| variant | score | checks | DIL nodes |
| --- | ---: | ---: | ---: |
| with DIL system prompt | **96%** | 25/26 | 62–93 per positive case |
| without any prompt | 35% | 9/26 | 0 |

- The model never reaches for DIL unprompted (0 nodes in every positive case).
- With five lines of instruction it produces valid DIL every time: no parse diagnostics in
  any of the ten recordings, including nested containers, `{#each}` bars with percentage
  widths, and badges.
- The one miss: `tabularNums` on the proportion numbers — a token detail, not a structural
  failure.
- Restraint holds: the `Promise.then → async/await` prompt stays pure Markdown in both
  variants (0 DIL nodes), so the prompt does not cause over-triggering.

Treat these as a capability signal, not a product guarantee: one model, one run, five
prompts. Recordings make regressions reviewable; `--runs 3` starts to say something about
stability.

## Adding a case

Add an entry to `DIL_CASES` with a prompt, a `why`, and checks built from `scoring.ts`
(`hasTag`, `anyTag`, `nestedAny`, `eachWith`, `attrPresent`, `noDil`, `fenceAtLeast`, …).
Then add an ideal answer to `ideal.ts` — the scorer test requires it, which is what keeps
new checks honest.
