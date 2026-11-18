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
npm run eval:dil                              # live Pi session, deepseek-flash
npm run eval:dil -- --provider opencode-go --model glm-5.3
npm run eval:dil -- --runs 3                  # sample variance
npm run eval:dil -- --dry                     # score the committed recordings
npm run eval:dil -- --record                  # refresh the recordings from a live run
npm run eval:dil -- flow comparison           # selected cases only
```

Every run carries the `<dil>` section — that is the product's state after `/webui`; there
is no "without prompt" arm, because the interesting question is not whether a model uses
DIL spontaneously (it does not) but whether the shipped prompt makes it use DIL well.

Credentials, in order: `<PROVIDER>_API_KEY` in the environment, the same name in a repo
`.env`, then `~/.pi/agent/auth.json` (what `pi` login writes). API-key providers only —
OAuth providers such as `openai-codex` need to be refreshed by Pi itself.

Each run prints a table (`prompt:dil` confirms the section was in Pi's prompt) and writes
two files: `reports/<provider>-<model>.json` for that model, and `report.json` as the
"latest run" pointer. A matrix therefore keeps every model's answers — the preview renders
one section per report, newest first, with the model name in the nav and heading.

`--dry` never touches either file: replaying recordings must not look like a live run.

### Several models

```bash
# CLI: one report per model, one preview page with all of them
npm run eval:dil -- --provider opencode-go --model deepseek-v4.1-flash
npm run eval:dil -- --provider opencode-go --model glm-5.3
just preview-eval

# vitest-evals: one suite per model, all results in a single Vitest JSON
DIL_EVAL_MODELS="opencode-go/deepseek-v4.1-flash,opencode-go/glm-5.3" \
  npm run eval:dil:vitest -- --reporter=json --outputFile=evals/dil/vitest-report.json
```

Both lanes persist everything; they differ only in the file format (our `reports/*.json`
summary vs Vitest's native JSON with per-spec results, artifacts and usage). To *see* the answers instead of the score table:

```bash
just preview-eval               # last live report, or the recordings when there is none
just preview-eval recordings    # only the committed recordings (no key needed)
npm run eval:dil:preview        # same as the first, without opening a browser
```

The preview bundles the real renderer with Vite and writes
`evals/dil/preview-out/index.html`: a sticky case nav (variant, case, score — click to
jump), per case the checks that passed or failed, then the answer rendered exactly as the
transcript shows it (DIL primitives for DIL answers, Markdown for the rest), with the raw
source one click away. The recordings under [`recordings/`](./recordings) were captured
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

## Results (2026-11-18, real Pi sessions, 1 run per case)

| model | score | checks | notes |
| --- | ---: | ---: | --- |
| `opencode-go/deepseek-v4.1-flash` | **96%** | 25/26 | states missed `{#each}`/card grouping; 55–124 DIL nodes per positive case |
| `opencode-go/glm-5.3` | **92%** | 24/26 | flow and comparison shipped no `<badge>` |
| `opencode-go/glm-5.3-flash` | **85%** | 22/26 | states stayed prose (0 DIL nodes), flow skipped container nesting |

- Ten out of ten positive-case answers parsed cleanly: no diagnostics, no truncated tags,
  including nested containers, `{#each}` bars with percentage widths, grids and badges.
- Restraint holds: the `Promise.then → async/await` prompt stayed pure Markdown (0 DIL
  nodes) on all three models, so the section does not cause over-triggering.
- The misses are shape choices, not parse failures — a model that answered with a static
  `grid` instead of `{#each}` still read well; the checks are deliberately strict there.

Treat this as a capability signal, not a product guarantee: three models, one run, five
prompts. The variance is real — the committed recordings are a second
`deepseek-v4.1-flash` run (`recordings/manifest.json`) and scored **77% (20/26)**: flow 83,
comparison 80, proportions 67, states 60, restraint 100. Same model, same prompt, ~20
points apart from the matrix run. `--runs 3` starts to say something about stability;
a single run does not.

## Adding a case

Add an entry to `DIL_CASES` with a prompt, a `why`, and checks built from `scoring.ts`
(`hasTag`, `anyTag`, `nestedAny`, `eachWith`, `attrPresent`, `noDil`, `fenceAtLeast`, …).
Then add an ideal answer to `ideal.ts` — the scorer test requires it, which is what keeps
new checks honest.
