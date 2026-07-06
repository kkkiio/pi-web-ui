# PRD: Workspace Status Float

## Problem Statement

Pi Web UI needs a lightweight workspace surface that answers two questions without forcing the user to inspect tool cards or switch to a terminal:

1. What git branch and diff state is the current workspace in?
2. Which Markdown files did the agent produce or modify during the current session?

The float is a compact status and entry surface. Full git diffs and full file contents belong in the Right Panel.

## Solution

Add a Codex-style Workspace Status Float in the chat area. It shows:

- the current git branch and diff summary
- Markdown artifacts produced by successful `edit` / `write` tool calls

Clicking the git row opens a `git-diff` tab in the Right Panel. Clicking an artifact opens an `artifact-file` tab in the Right Panel.

## User Stories

1. As a desktop user, I can see the current branch so I know which workspace branch I am editing.
2. As a desktop user, I can see additions/deletions so I can judge change size quickly.
3. As a user, I can click the git row and inspect the full diff in the Right Panel.
4. As a user, I can see Markdown files touched by the agent and open their content from the Right Panel.
5. As a user, I can open Markdown artifacts written outside the git workspace when they were created by this Pi session.
6. As a mobile user, I get a compact workspace entry that does not cover the chat surface.

## Display Content

The float contains two sections:

| Section | Content |
|---------|---------|
| Git | branch, diff summary, clean state, or non-repo state |
| Artifacts | recent Markdown artifacts from successful `edit` / `write` tool calls |

Do not display workspace name, workspace path source, or a `Local` row.

## Git Status

The frontend actively requests git status from the extension. Git status is not part of `state_sync` or `get_state`.

Refresh triggers:

- WebSocket connection and reconnection
- session sync completion
- tool execution end
- turn end

Refresh should be debounced so streaming/tool bursts do not spam git commands.

Git row behavior:

- Git repository with changes: show branch plus `+N -N`.
- Git repository without changes: show branch plus `No changes`.
- Non-git workspace: show `No git repository` and keep the row disabled.
- Unknown/unavailable state: show an unavailable state until the next successful refresh.

Clicking a git repository row opens the Right Panel `git-diff` tab. The tab loads diff content through `get_git_diff`.

## Git Diff Details

The Right Panel renders git diff content with `@git-diff-view/react` so additions, deletions, file names, and hunks are readable. The panel also shows branch and aggregate additions/deletions.

The diff reader includes staged, unstaged, and untracked Markdown/text file changes when available from the extension command.

The float does not render full diff content inline.

## Artifacts

Artifacts are Markdown files touched by successful Pi `edit` or `write` tool calls. Supported extensions:

- `.md`
- `.mdx`
- `.markdown`

Artifact behavior:

- Include workspace files and workspace-external files when the current Pi session successfully wrote or edited that exact path.
- Deduplicate by normalized path.
- Sort newest first.
- Show at most the recent set that fits comfortably in the float.
- Clicking an artifact opens or focuses the matching `artifact-file` Right Panel tab.

Workspace-external artifact content is available only when the current session produced it. Arbitrary absolute path reads are not part of the artifact model.

## Right Panel Relationship

The float is an entry surface for Right Panel tabs:

- Git row opens `git-diff`.
- Artifact row opens `artifact-file`.
- Re-clicking an already-open target focuses the existing tab.
- When the Right Panel is visible, the float hides.
- When the Right Panel is hidden, the float returns.
- Closing the last tab hides the Right Panel while preserving the restore affordance.

## Mobile Behavior

Mobile does not show the large desktop float. It uses a compact workspace button that opens the appropriate Right Panel surface:

- If git diff is available, open `git-diff`.
- Otherwise, if artifacts exist, open the most recent artifact.
- If neither is available, keep the button disabled.

The Right Panel should behave as a full-width sheet-like surface on mobile.

## Out Of Scope

- Commit, push, checkout, stash, or other git mutations
- Editing files from the float or Right Panel
- Rendering full diff content inside the float
- Rendering full artifact file content inside the float
- Showing non-Markdown artifacts
- Showing external agent/subagent state

## Acceptance Criteria

1. Desktop float shows current git branch.
2. Git repository with changes shows additions and deletions.
3. Clean git repository shows `No changes`.
4. Non-git workspace shows `No git repository`.
5. Clicking the git row opens one `git-diff` tab in the Right Panel.
6. Re-clicking the git row focuses the existing `git-diff` tab instead of creating duplicates.
7. Successful Markdown `edit` / `write` tool calls appear in the artifact list.
8. Duplicate writes to the same Markdown path show one artifact row.
9. Clicking an artifact opens one `artifact-file` tab with readable Markdown content.
10. Workspace-external Markdown artifacts written by the current session can be opened from the artifact list.
11. Right Panel visibility and restore button behavior match `docs/prd/right-panel.md`.
12. Mobile uses the compact workspace entry and does not display the desktop float.
