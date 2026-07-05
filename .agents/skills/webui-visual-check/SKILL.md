---
name: webui-visual-check
description: Browser-based visual validation for Pi Web UI. Use when Codex changes UI layout, rendering, responsive behavior, WebSocket-driven visible state, session tree/sidebar, Workspace Status Float, Right Panel, mobile sheets, or artifact display and must verify the real rendered page with in-app Browser screenshots rather than DOM-only checks. This skill is not E2E; E2E requires a real Pi agent path.
---

# Pi Web UI Visual Check

Use this skill to validate visible Pi Web UI behavior in the in-app Browser. The skill's job is visual verification: confirm what the user would actually see, capture screenshots, and report visible evidence.

## Rules

- Use the Browser tool for visual validation. Do not conclude that UI works from DOM selectors alone.
- Prefer screenshots for layout-sensitive features: sidebars, trees, floating panels, right panel tabs, sheets, resizable surfaces, overlays, empty states, loading states, and clipped/truncated text.
- Verify text is readable, controls are visible, rows are inside the viewport, and panels are not hidden behind collapsed rails, overlays, or offscreen positioning.
- Check both desktop and mobile viewport behavior when the change claims responsive support.
- Do not write resolved machine-specific absolute paths into docs, commits, PRs, screenshots, or handoff notes. Use `$PWD`, `$HOME`, `.tmp/...`, env vars, or relative paths in written notes.
- Do not leave transient servers running silently. Stop them before finishing, or explicitly report the URL and process/session that remains running for manual inspection.
- Do not describe this workflow as E2E. E2E is reserved for real Pi agent tests defined in `docs/adr/0010-real-pi-web-ui-e2e.md`.

## What To Inspect

For conversation tree/sidebar changes, verify:

- Sidebar is visibly expanded on desktop when expected.
- Visible tree rows fit within the sidebar and text is readable.
- Selected/current/active states are visually distinct.
- Clicking rows, Branch, Continue, collapse, search, and scroll-current controls produces visible states consistent with the feature.

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
- What the screenshot showed for the changed UI.
- Any visible defects: overlap, clipping, hidden controls, unreadable text, wrong active state, blank content, or non-responsive layout.
- Supporting DOM dimensions only when they explain a visual issue. DOM existence alone is not enough.

## Failure Pattern To Avoid

Do not accept a selector match as proof that a feature is visible. A row, tab, or panel may exist in the DOM while clipped, transparent, offscreen, covered, or hidden behind a collapsed surface. Always confirm with a screenshot or visible bounding boxes inside the viewport.
