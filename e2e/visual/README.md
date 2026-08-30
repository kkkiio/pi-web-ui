# Visual Scenario Gallery

Fixed, ready-made environments for looking at the Pi Web UI in specific states.
Built for the `$webui-visual-check` skill: an agent (or human) starts a scenario,
opens the printed URL, and inspects screenshots — no ad-hoc state construction.

## Usage

```bash
just visual <scenario>     # builds web+hub, starts the scenario, prints the URL
```

Ctrl-C stops the hub/pi processes and removes the temp workspace.

Scenarios run the **real** hub + **real** `pi --mode rpc` with the faux LLM
provider (canned responses, no model cost, deterministic state). Tool calls in
fixtures execute for real in the temp workspace.

## Scenarios

| Name | State | Key things to look at |
|---|---|---|
| `chat-rich` | thinking + bash + image tool result + final answer; clean git | chevron alignment, bash auto-collapse, IMAGES strip + lightbox, header git chip, input toolbar |
| `tool-error` | failing write tool | error block auto-expanded, stays expanded |
| `git-clean` | git repo, no changes | header chip without +/-, right panel "No changes" |
| `git-messy` | modified + deleted + untracked text + untracked binary | diff panel renders all shapes, no white screen, binary fallback |
| `no-git` | no git repo | no git chip in header |
| `compact` | chat history then rpc `compact` | compaction banner with summary inline in the chat; survives re-attach via snapshot |

The registry lives in `serve.mjs` (`SCENARIOS`); each entry prints its `lookAt`
hints when started. Add new scenarios there; new canned LLM responses go in
`e2e/fixtures/responses/` and register in `e2e/fixtures/faux-provider-extension.ts`.

## With agent-browser

```bash
just visual git-messy            # terminal 1 (stays alive)
agent-browser --session webui-visual open <printed-url>
agent-browser --session webui-visual set viewport 1280 800   # or 390 844 for mobile
agent-browser --session webui-visual screenshot --annotate .tmp/visual-check/<name>.png
```
