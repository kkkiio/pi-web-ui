# Workspace Status Float Spec

## Status

Draft

## Goal

Add a Codex-style upper-right floating status card for the classic two-column
chat workspace. The float gives compact situational awareness without moving the
main chat.

The current version shows only `Subagents`. The component name remains
`WorkspaceStatusFloat` because this surface may later also host Artifacts, such
as plans or other important intermediate results.

The float is not a generic context-item browser. Each supported section should
present the specific information that matters for that section.

## Relationship to Columns Layout

The status float belongs only to the classic two-column mode.

Rules:

- When the right detail sidebar is closed, the float is visible by default.
- When the right detail sidebar opens, the float is hidden.
- The float and right detail sidebar are mutually exclusive surfaces.
- Clicking a row that needs expanded inspection opens the right detail sidebar
  and hides the float.

This keeps the float as a compact overview and avoids competing right-side
surfaces.

## Placement

Desktop:

- Position near the upper-right of the chat workspace.
- Keep it visually separate from the message stream without turning it into a
  full side panel.
- Do not cover the message composer.
- Do not show it while the right detail sidebar is open.

Mobile:

- Do not keep a large floating card over the chat.
- Use a compact trigger or sheet if the same information needs to be reachable.

## Visibility

In desktop two-column mode, the float is shown by default. If there are no
sub-agents yet, it should show a compact empty state instead of disappearing.

## Sections

### Subagents

Shows running or completed Pi sub-agents, including foreground, background, and
scheduled agents when Tau has enough information to identify them.

Each row should communicate:

- Status.
- Agent type.
- Short description.
- Compact metric, result preview, or error preview when available.

Clicking a sub-agent row:

1. Selects that sub-agent.
2. Opens the right detail sidebar.
3. Hides the float because the workspace is now in three-column mode.

The float should not render long sub-agent results. Final output belongs in the
right detail sidebar.

### Refresh, Reconnect, and History Loading

The Web UI should rebuild foreground sub-agent rows from session history after a
page refresh or when the user opens a saved session from the left sidebar.

Rules:

- Foreground Pi `Agent` tool calls should appear in the float after refresh.
- Foreground Pi `Agent` tool calls should also appear when viewing a historical
  session, even when no live `subagents:*` extension events are replayed.
- A historical assistant `Agent` tool call provides the queued/running row
  metadata, such as description and sub-agent type.
- The matching historical `toolResult` provides the terminal status, final
  response, tool count, duration, and stable agent id when available.
- If an `Agent` tool call exists without a matching result yet, the row should
  be shown as running using the tool call id as a temporary id.
- Background and scheduled sub-agents can only be restored after refresh when
  their extension writes durable session entries or sends a snapshot event.

### Future Artifacts

Artifacts are planned but out of scope for the current version.

Rules:

- Artifacts should represent important intermediate results, such as a plan,
  generated report, or preview-worthy file.
- Artifact rows should be designed around their own useful information, not
  forced into a generic context-item shape.
- Adding Artifacts should not reintroduce environment or source status rows
  unless those become concrete product features.

## Attention Rules

The float or its trigger may show attention state.

Suggested rules:

- Running or queued sub-agents count as active.
- Failed, stopped, aborted, and completed sub-agents can request attention until
  opened.
- If an already-opened sub-agent receives new information later, it can request
  attention again.
- Acknowledgement is a UI behavior; it should not change the underlying
  sub-agent result.

## Non-Goals

- Do not make the float a universal context-item renderer.
- Do not show Progress, Environment, or Sources in the current version.
- Do not show raw event JSON as the primary float content.
- Do not add manual sub-agent spawning controls in the first version.
- Do not replace existing model, session, settings, or TUI management controls.
