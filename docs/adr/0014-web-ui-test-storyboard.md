# ADR 0014: Storyboards for Web UI E2E Scenarios

## Status

Accepted (local preview). Publishing to GitHub Pages is deferred; see the end of this
document.

## Context

Web UI E2E scenarios are written as Gherkin and asserted in step definitions. Reading
`Given/When/Then` tells a reviewer what the test does, but not what the user sees, and
not why the scenario deserves to exist. The existing artifacts do not close that gap:

- The Playwright HTML report must be downloaded and served locally before it is usable.
- `trace.zip` is a debugging tool: it samples snapshots per action (throttled, no frames
  while the page is idle), and its play button steps between action states. It answers
  "what did the test see when this assertion failed", not "what does this scenario look
  like".
- rrweb-style DOM replay was evaluated and rejected (see Alternatives): it rebuilds the
  page instead of recording it, and its recorder is injected into the page under test.

Reviewers also cannot judge whether a newly added scenario is valuable without seeing
the flow. A scenario that passes but nobody understands is dead weight.

## Decision

**Every web E2E scenario gets a storyboard: a recorded video, one screenshot per
Gherkin step, step chapters, and the scenario's `Why` line. Storyboards are recorded on
demand and reviewed locally.**

### What a storyboard contains

- **Video** of the real browser driven by a real `pi --mode rpc` session (faux model,
  real tools, real temp workspace).
- **One screenshot per Gherkin step**, taken at the end of the step.
- **Step chapters** aligned to the recording via wall-clock timings, so a reviewer can
  jump to the step that matters instead of scrubbing.
- **The scenario's `Why` line**, rendered above the video.

It contains no pass/fail badges and no run duration: a storyboard documents the
scenario, not a CI execution.

Scenarios tagged `@no-ui` never open a browser (the activation boundary in
`webui-activation.feature`), so they get no storyboard. The gallery also drops any
scenario without a recording.

### Recording scope

Scope is explicit; nothing diffs the repository to guess it:

```bash
npm run e2e:storyboard -- e2e/features/edit-message.feature   # record and merge
npm run e2e:storyboard -- --full                              # full run
npm run e2e:preview                                           # http://127.0.0.1:8899/
```

A subset run merges with the previous gallery, guarded so a partial run never shows
stale previews:

- `manifest.json` stores a hash of `e2e/steps/**`, `e2e/harness/**` and the Playwright
  config. If it changed, merging is refused.
- A hash of `src/web/**` and `extensions/**` is stored too: a UI change invalidates
  every recording, so merging is refused and a full run is required.
- Each feature file is hashed. Scenarios from an edited feature are dropped unless
  they were recorded in this run.
- Scenarios that no longer exist in their feature file are dropped.
- Everything else is carried over with its assets copied from the base build.

`record.mjs` falls back to a full run when the merge is refused. The builder writes
into a staging directory and swaps it in at the end, so a running preview never
disappears while a new build happens.

### Recording rules

- Storyboard runs use `slowMo: 250` so each step is visible; CI runs at full speed.
- CI does not record storyboards. `ci.yml` stays a fast functional gate (50s), and this
  workflow is not duplicated there.
- Each storyboard records the commit it was built from (`manifest.json` → `commit`,
  `dirty`) and the gallery footer shows it. A storyboard built from uncommitted changes
  is marked as such, so nobody mistakes it for a published revision.

## Scope

In scope:

- The storyboard artifact, its recording hooks, and the static gallery.
- The scenario writing rules that make a storyboard understandable (title, `Why` line,
  user-observable steps).

Out of scope:

- Pass/fail reporting. That stays in CI: job summary, failure screenshots, trace.
- Visual regression baselines. Pixel assertions remain separate from storyboards.
- Publishing previews to a URL. Deferred (see below).

## Consequences

### Positive

- A reviewer understands a scenario's flow and value in seconds, without reading step
  definitions.
- New scenarios are reviewed as product behavior, not as code.
- Recording is opt-in and scoped, so the CI gate stays fast and results stay honest.
- The gallery is a plain directory: no server, no backend, no external service.

### Negative

- Reviewers must have the repository and run `npm run e2e:preview` to see a storyboard;
  sharing one requires exporting the directory or attaching screenshots to the PR.
- Storyboard runs are slower than CI runs, and their timing is deliberately not the CI
  timing; they must not be used to diagnose races or slowness.
- A renamed scenario changes its `<scenario-id>`, breaking previously shared links.
- Storyboards go stale when UI code changes; the `uiHash` guard forces a full re-record
  rather than letting a merge publish outdated videos.

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| Playwright HTML report as CI artifact | Requires download plus a local server; usable for debugging, not for reading scenarios |
| `trace.playwright.dev` links to uploaded traces | Debugging interface, not a preview: action-indexed snapshots, no continuous playback |
| rrweb DOM replay | Sharp at any zoom and ~35 KB gzipped, but it rebuilds the page instead of recording it; CSS animation fidelity and injection risk (it crashed the renderer at document-start in our experiment); adds a recorder plus player to maintain |
| Commit videos to the main branch | Binary bloat in history; recordings are generated output |
| Publish to GitHub Pages per PR | Strongest review experience, but adds a second E2E run per PR, a publish workflow, retention rules, and a trust question ("which commit was this recorded from"). Deferred until the local workflow proves useful |

## Deferred: publishing previews

If storyboards prove useful in review, the publishing design already explored is:

- an orphan `gh-pages` branch containing only generated output, kept to a **single
  snapshot commit** (force-pushed) so binaries never accumulate in history;
- `e2e/main/...` plus per-PR directories `e2e/pr-<number>/...`, pruned when a PR closes;
- deterministic URLs (`/e2e/pr-<n>/scenarios/<scenario-id>.html`) so links can be
  predicted and diffed;
- recording in CI on demand (`workflow_dispatch` or a PR label), not on every PR;
- the manifest's `commit` / `dirty` fields as the traceability check.

None of that is implemented. Revisit when local storyboards are actually used during
review.

## Migration

Done:

- `e2e/steps/hooks.ts` records per-step screenshots and timings.
- `e2e/report/build-report.mjs` builds the static gallery; `build-summary.mjs` writes
  the CI job summary.
- `e2e/report/record.mjs` records an explicit feature set (or everything) and merges.
- `e2e/report/serve.mjs` serves the gallery locally with range requests.
- `npm run e2e:storyboard` / `e2e:preview` / `e2e:gallery` / `e2e:gallery:merge`.
- Feature files carry a one-line `Why`; the gallery renders it above the video.
- `@p0` / `@p1` / `@no-ui` are shown as coloured chips.
- The visual-validation rule from the former `webui-visual-check` skill lives in
  `AGENTS.md` (Testing & Checks); the skill was removed.

Not done:

- Publishing to GitHub Pages.

## References

- `AGENTS.md`
- `docs/adr/0010-real-pi-web-ui-e2e.md`
- `docs/adr/0011-web-ui-visual-validation.md`
- `docs/adr/0012-interactive-agent-ui-positioning.md`
- `e2e/playwright.config.ts`
- `e2e/steps/hooks.ts`
- `e2e/report/build-report.mjs`
- `e2e/report/record.mjs`
