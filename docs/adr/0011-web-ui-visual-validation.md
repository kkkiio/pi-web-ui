# ADR 0011: Web UI Visual Validation

## Status

Proposed

## Context

Pi Web UI has layout-sensitive surfaces: conversation tree, sidebars, Workspace Status Float, Right Panel tabs, mobile sheets, overlays, loading states, and long text/path truncation. DOM assertions can prove elements exist, but they cannot prove the user can actually see and use the UI without clipping, overlap, offscreen positioning, unreadable text, or blank panels.

The project also has strict E2E terminology. Per ADR 0010, E2E requires a real Pi agent path. Browser screenshot inspection may use any suitable running Web UI state, including a lightweight visual harness, but it is not E2E unless it includes real Pi agent execution.

## Decision

Define **Visual validation** as a separate testing and review layer.

Visual validation answers one question: "Does the rendered Web UI look usable to a real user in the browser?" It uses Browser screenshots and visible inspection. It does not prove the full Pi agent product path and should not be labeled E2E.

The Codex skill for this workflow is named:

```text
webui-visual-check
```

Use it after UI/layout/rendering changes where DOM-only checks can miss visible regressions.

## Scope

Visual validation covers:

- layout, clipping, overlap, viewport fit, offscreen positioning, and blank states;
- readable text and professional truncation;
- visible active/current/selected states;
- desktop/mobile responsive behavior;
- Workspace Status Float visibility and row fit;
- Right Panel tab bar, active tab, close/toggle controls, and scrollable content;
- conversation tree sidebar expansion, selected row, Branch/Continue controls, and tree row readability.

Visual validation does not cover:

- whether Pi agent/tool/session behavior is correct;
- whether git diff/artifact state was produced through real tools;
- whether Playwright-BDD acceptance flows pass;
- pixel-perfect screenshot baselines.

## Relationship To E2E

ADR 0010 E2E tests perform functional assertions against the real Pi product path. They may catch many UI regressions, but they do not own visual quality.

Visual validation may inspect:

- a real Pi E2E run after it creates the target state;
- a locally running Web UI connected to a real Pi session;
- a future frontend visual harness that prepares UI state without Pi.

Only the first two include real Pi. A frontend-only visual harness is useful, but it remains Visual validation, not E2E.

## Skill Behavior

`webui-visual-check` should:

- open the real rendered page in the Browser tool;
- use screenshots or visible bounding boxes for layout-sensitive claims;
- inspect desktop and mobile viewports when the change claims responsive support;
- report visible defects such as overlap, clipping, hidden controls, unreadable text, wrong active state, blank content, or squeezed mobile layout;
- avoid treating selector matches as proof of visibility.

The skill should not describe how to run faux provider, Playwright-BDD, or E2E harness setup. Those belong to `AGENTS.md` and ADR 0010.

## Consequences

### Positive

- Keeps E2E terminology strict.
- Gives screenshot-based review a first-class name.
- Prevents agent reviewers from accepting DOM-only checks for visual layout changes.

### Negative

- Adds another testing term that contributors must learn.
- Visual validation may remain partly manual until automated visual tooling exists.

## References

- `AGENTS.md`
- `docs/adr/0010-real-pi-web-ui-e2e.md`
- `.agents/skills/webui-visual-check/SKILL.md`
