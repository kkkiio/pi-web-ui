# DIL evals — can the model write a UI instead of a wall of prose?

Five prompts, each a real coding-agent pain point, scored by **parsing the answer** and
checking the structure it asked for. Four must produce a specific DIL shape; the fifth is
a negative control that must stay plain Markdown (over-triggering is a failure too).

The cases are the benchmark design from the DIL research notes: *relational flow*,
*spatial comparison*, *quantitative proportions*, *state taxonomy*, and *restraint*. Each
case carries its prompt, the DIL it hopes for, why Markdown alone loses, and the checks
that decide pass/fail — see [`cases.ts`](./cases.ts).

## The harness is Pi, not a bare model call

pi-web-ui is a Pi extension, so an eval that calls a provider directly measures the wrong
thing. Each run here builds a **real Pi agent session**:

- Pi's own system prompt (preamble, tools, rules, docs, cwd) plus the `<dil>` section that
  `extensions/dil-prompt.ts` injects through `before_agent_start` — the production
  mechanism, so a run also proves the section reached the prompt (`prompt:dil` in the
  output);
- the working directory is this repository and the agent may use **read-only** tools
  (`read`, `grep`, `find`, `ls`), because that is how the product answers questions about
  the project; it cannot edit anything;
- Pi's global config is isolated per run (temp agent dir), so user extensions and skills do
  not leak into the measurement;
- the final transcript text is scored by `parseDocument` from `src/web/src/core/dil`, so a
  pass means the DIL really parsed, not that a judge liked it.

`@earendil-works/pi-evals` is `private: true` in the Pi monorepo and Dockerises its own agent
session to audit Pi's documentation, so it cannot be a dependency here; this directory keeps
its shape (case list → harness → deterministic checks → optional judge) and runs the agent
in-process instead.

`scoring.test.ts` proves the checks with hand-written ideal answers, so the offline half of
the suite works without a key and a check that can never pass fails loudly.

## Run

```bash
npm run eval:dil                              # live Pi session, deepseek-flash, DIL section
npm run eval:dil -- --variant both            # also run without the section (lift)
npm run eval:dil -- --provider opencode-go --model glm-5.3
npm run eval:dil -- --runs 3
npm run eval:dil -- --dry                     # score the committed recordings
npm run eval:dil -- --record                  # refresh the recordings from a live run
npm run eval:dil -- flow comparison           # selected cases only
```

Credentials, in order: `<PROVIDER>_API_KEY` in the environment, the same name in a repo
`.env`, then `~/.pi/agent/auth.json` (what `pi` login writes). API-key providers only —
OAuth providers such as `openai-codex` need to be refreshed by Pi itself.

Each run prints a table (`prompt:dil` confirms the section was in Pi's prompt) and writes
`report.json` (gitignored). To *see* the answers instead of the score table:

```bash
npm run eval:dil:preview                 # render the last report.json
node evals/dil/preview.mjs --recordings  # render the committed recordings
```

The preview bundles the real renderer with Vite and writes
`evals/dil/preview-out/index.html`: per case, the checks that passed or failed, then the
answer rendered exactly as the transcript shows it (DIL primitives for DIL answers,
Markdown for the rest), with the raw source one click away. The recordings under [`recordings/`](./recordings) were captured
with the earlier raw-completion harness and are kept only as history; regenerate with
`--record` before trusting `--dry`.

## Two lanes: CLI and Vitest

The CLI above answers "how good is the model, per case, right now". The same cases also
run through **[`vitest-evals`](https://vitest-evals.sentry.dev)** when you want
test-shaped output, filtering, retries, judges and reporters:

```bash
npm run eval:dil:vitest                                   # all cases, live
npx vitest run --config vitest.evals.config.ts -t flow     # one case
npx vitest run --config vitest.evals.config.ts --retry 2   # sample variance
```

[`pipeline.eval.ts`](./pipeline.eval.ts) is a ~30-line `createHarness` wrapper around
`generate.ts`, and the assertions are the same `scoreCase` checks. Both lanes share the
cases, the scoring and the credentials.

What is usable today, and what is not:

| piece | status |
| --- | --- |
| `vitest-evals@0.18.1` | works; peers `vitest >=5` (this repo pins `vitest@5.1.1`), `ai >=4 <7`, `zod` |
| `createHarness` + `describeEval` | works with our own pi-ai harness |
| `@vitest-evals/harness-pi-ai` | **not** usable: peers `@mariozechner/pi-ai >=0.67 <1`, while this repo uses `@earendil-works/pi-ai@1.5.x` |
| judges (`createJudgeHarness`, `toSatisfyJudge`) | available for a future LLM rubric |

`vitest.evals.config.ts` is live-only (a real model call per test), so it stays out of
`just check` and CI; the offline contract remains `npm run test:dil`.

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
