---
name: webui-visual-check
description: Browser-based visual validation for Pi Web UI. Use when an agent changes UI layout, rendering, responsive behavior, WebSocket-driven visible state, session sidebar, Workspace Status Float, Right Panel, mobile sheets, or artifact display and must verify the real rendered page with browser screenshots rather than DOM-only checks. Uses the agent-browser CLI; not E2E — E2E requires a real Pi agent path.
---

# Pi Web UI Visual Check

Use this skill to validate visible Pi Web UI behavior with real browser screenshots. The skill's job is visual verification: confirm what the user would actually see, capture screenshots, and report visible evidence.

## Prerequisite

This skill drives the browser with the [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI (no host-specific built-in browser tool required):

```bash
npm install -g agent-browser
agent-browser install   # first time only; detects existing Chrome/Playwright installs
agent-browser doctor    # optional sanity check
```

If `agent-browser` is missing, install it or stop and ask the user — do not fall back to DOM-only conclusions.

## Core Loop

**Prefer fixed scenario environments when one matches what you need to see.**
`just visual <name>` (see `e2e/visual/README.md` and the `SCENARIOS` registry in
`e2e/visual/serve.mjs`) starts a real hub + real pi session driven into a known
state and prints a URL — no ad-hoc state construction. If none of the fixed
scenarios covers your change, build the state manually as below and consider
adding a new scenario afterwards.

Work in a single isolated session and drive it interactively:

```bash
agent-browser --session webui-visual open <url>
agent-browser --session webui-visual set viewport 1280 800      # desktop; 390 844 for mobile
agent-browser --session webui-visual wait --load networkidle
agent-browser --session webui-visual snapshot -i -c             # a11y tree with @eN refs
agent-browser --session webui-visual click @e2                  # interact via refs or selectors
agent-browser --session webui-visual screenshot --annotate .tmp/visual-check/<name>.png
```

- Use `screenshot --annotate` so numbered labels map to `@eN` refs for follow-up interactions; read the saved PNG to judge the visual result.
- Create the screenshot directory first (`mkdir -p .tmp/visual-check`). Write screenshots under `.tmp/` or another ignored temp path — never into docs, commits, or `docs/images/`.
- Check responsive claims at both desktop (e.g. 1280×800) and mobile (e.g. 390×844) viewports with `set viewport <w> <h>`.
- Use `get box <sel>` / `is visible <sel>` only as supporting evidence for a visual issue — never as proof a feature looks right.
- When inspecting a state created by E2E or a live local Pi session, start that state first (e.g. hub on :3001, or the dev server on :4444), then point `agent-browser open` at its URL.

## Rules

- Do not conclude that UI works from DOM selectors or `snapshot` output alone. Always confirm with a screenshot you have actually viewed.
- Prefer screenshots for layout-sensitive features: sidebars, floating panels, right panel tabs, sheets, resizable surfaces, overlays, empty states, loading states, and clipped/truncated text.
- Verify text is readable, controls are visible, rows are inside the viewport, and panels are not hidden behind collapsed rails, overlays, or offscreen positioning.
- Do not write resolved machine-specific absolute paths into docs, commits, PRs, screenshots, or handoff notes. Use `$PWD`, `$HOME`, `.tmp/...`, env vars, or relative paths in written notes.
- Do not leave transient servers or browser sessions running silently. Run `agent-browser --session webui-visual close` (and stop any dev server/hub you started) before finishing, or explicitly report the URL and process/session that remains running for manual inspection.
- Do not describe this workflow as E2E. E2E is reserved for real Pi agent tests defined in `docs/adr/0010-real-pi-web-ui-e2e.md`.

## What To Inspect

For session sidebar changes, verify:

- Sidebar is visibly expanded on desktop when expected, and collapses cleanly.
- Visible session rows fit within the sidebar and text is readable.
- Selected/current/active states are visually distinct.
- Clicking rows, collapse, search, and resize-rail interactions produce visible states consistent with the feature.

For Workspace Status Float changes, verify:

- The float is visible in desktop two-column mode and hidden when the Right Panel is open.
- Git branch and diff status fit without overlap.
- Artifact rows fit, truncate professionally, and remain clickable.
- Empty and non-git states are visible and understandable.

For Right Panel changes, verify:

- The panel opens on the right in desktop layouts.
- Tab labels, active tab state, close buttons, and toggle button are visible.
- Hiding and restoring the panel preserves expected tabs.
- Git diff and artifact-file content are scrollable and not clipped.
- Mobile uses a sheet-like surface rather than squeezed columns.

## Relationship To E2E

Use this skill for visual validation only. It may inspect a state created by a real E2E run, a local Pi session, or another prepared UI state, but its proof is the rendered screenshot. It does not prove the Pi agent/tool/session path.

## Evidence To Report

In the final summary, include:

- The URL and viewport(s) inspected.
- What each screenshot showed for the changed UI, with the relative screenshot paths.
- Any visible defects: overlap, clipping, hidden controls, unreadable text, wrong active state, blank content, or non-responsive layout.
- Supporting DOM dimensions (`get box`) only when they explain a visual issue. DOM existence alone is not enough.

## Failure Pattern To Avoid

Do not accept a selector match, `snapshot` ref, or `is visible` result as proof that a feature is visible. A row, tab, or panel may exist in the DOM while clipped, transparent, offscreen, covered, or hidden behind a collapsed surface. Always confirm with a screenshot you viewed, or visible bounding boxes inside the viewport.
