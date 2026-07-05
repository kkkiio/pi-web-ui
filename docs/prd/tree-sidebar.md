# PRD: Conversation Tree Sidebar

## Overview

Replace the old session list/sidebar with a compact conversation tree for the current Pi session. The tree visualizes parent-child relationships, branch segment starts, collapse state, and same-session Branch entry points.

Pi naming matters:

| Pi concept | Meaning | Web UI mapping |
|------------|---------|----------------|
| `/tree` / `navigateTree()` | Move within the current session tree; continuing creates branches in the same JSONL file | **Branch** |
| `/fork` / `ctx.fork()` | Create a new session file from a previous user message | Future **Fork** feature, not implemented here |

The current feature is Branch, not Fork.

## User Stories

### US-1 — Understand the current session tree

As a developer, I want to see the current session as a tree so I can understand where branches diverged.

- Show visible session entries as compact rows.
- Connect parent-child relationships with neutral tree lines.
- Show branch affordances on child branch segment starts, matching Pi TUI `/tree`.
- Keep line connectors independent from collapsible widgets: a row can have a connector without a chevron.
- Order siblings deterministically by `timestamp`, then `entry.id`; selecting or branching must not reorder siblings.

### US-2 — Select and locate without mutating session state

As a developer, I want clicking a tree row to help me inspect or locate a message without changing the active Pi session branch.

- Clicking a row sets local selected state only.
- If the selected entry or nearest visible ancestor is present in the current conversation, scroll it into view and briefly highlight it.
- If the selected entry is on another branch and not present in the current conversation, keep the highlight in the tree only.
- Row click does **not** call `navigate_tree`, does **not** change `leafId`, does **not** refresh `entries`, and does **not** touch the draft.

### US-3 — Branch from user messages

As a developer, I want an explicit Branch action for user messages so I can edit a previous input and continue in the same session tree.

- User message rows in the main conversation show a Branch action.
- User nodes in the tree show a Branch action, including user nodes from non-current branches.
- Branch action navigates the tree to the selected user message's parent.
- On success, refresh state, populate the input with the original message text, focus the input, and show a subtle "Branching from ..." status.
- If a draft already exists, confirm before replacing it.
- Only user message entries are branchable.

### US-4 — Continue from existing branch ends

As a developer, I want to jump to the end of an existing branch so I can continue from that context without editing an earlier prompt.

- Non-current terminal leaf rows show a Continue branch action when the leaf is not a user/custom message.
- Continue navigates the tree to the selected leaf.
- Continue refreshes state and focuses the input after navigation.
- Continue preserves the draft exactly as-is: no confirmation, no clearing, no overwrite.
- User-message leaves do not show Continue because navigating to a user message intentionally means Branch-from-before-that-user-message.

### US-5 — Collapse and search large trees

As a developer, I want to collapse and search branches without losing the tree shape.

- A branch segment start may show a chevron when it has visible descendants.
- Collapsing a segment hides only that segment's descendants; sibling segments remain visible.
- Search filters by node text and detail text, expands matching paths while searching, and restores previous collapse state when cleared.

### US-6 — Avoid duplicated session chrome

As a developer, I want session title/model shown once so the sidebar stays focused on navigation.

- The app header is the canonical place for current session title, model, thinking level, context, and cost.
- The left sidebar header only shows Pi Web UI branding, connection state, and the sidebar trigger.

## Functional Requirements

### Flat Row Layout

The tree renders as one flat list of rows. Branch nesting depth is encoded in fixed left columns, not by recursively nesting menu components.

Current nested layout:

```text
[subtree indent][connector][chevron][accent][text................][action][scrollbar]
               |---------- extra spacing ----------|              ^ can be covered
```

Target flat row layout:

```text
[tree gutters][action slot][text........................]

  |--v   B   user: 可以，那你先帮我建目录...
  |      C   assistant update
  |          bash: mkdir -p docs/specs/...
  `--v   B   user: 写个骨架吧...
```

Column semantics:

```text
tree gutter : connector + expand/collapse button
action slot : B = Branch, C = Continue branch, blank = no action
text        : message/tool summary, always aligned across rows
```

- Tree rows are produced by the model as flat rows with `depth` and connector metadata.
- React renders a single `rows.map(...)` list; it does not use recursive `SidebarMenuSub` nesting.
- The tree gutter and action slot are fixed-width columns on the left of every row.
- Branch and Continue actions live in the left action slot so overlay scrollbars cannot cover them.
- User rows do not use a blue accent rail; branchable state is expressed by the Branch action plus slightly stronger text weight/color.

### Compact Tree Rendering

- Rows are dense, single-line, and truncate long text.
- Indentation is based on branch nesting depth, not raw parent-chain depth.
- Hidden bookkeeping entries (`custom`, `label`, `model_change`, `thinking_level_change`, `session_info`) are omitted and visible descendants reattach to their nearest visible ancestor.
- Assistant tool-call-only messages are hidden unless they are the current leaf or represent an error/abort.
- Branch segment starts draw CSS connectors outside the row content.
- Collapse state is keyed by branch segment start entry id.

### Row Elements

| Element | Description |
|---------|-------------|
| Tree connector | CSS line for branch child rows, independent from collapse |
| Chevron | Expand/collapse control for branch segment descendants |
| Action slot | Fixed left column for Branch, Continue branch, or an empty alignment placeholder |
| Node text/detail | Compact summary of message/tool/event |
| Branch button | Branch action on branchable user nodes |
| Continue button | Continue action on non-current terminal non-user branch leaves |
| `+N` badge | Hidden descendant count for collapsed segments |

### Click Targets

| Target | Action |
|--------|--------|
| Row body | Local select/locate/highlight only |
| Chevron | Collapse or expand this branch segment descendants |
| Branch button | Call `navigate_tree`, refresh state, fill draft |
| Continue button | Call `navigate_tree`, refresh state, preserve draft, focus input |
| Refresh button | Request full state refresh |
| Scroll-current button | Scroll sidebar to current `leafId` row |

### Branch Flow

1. User clicks Branch on a user message or tree user node.
2. System confirms if draft is non-empty.
3. Pi navigates to the selected user message's parent and returns the original message text.
4. System fills the draft with the original text, focuses the input, and shows "Branching from ...".
5. User sends the edited message; Pi appends a new branch in the same session tree.

### Continue Flow

1. User clicks Continue on a non-current terminal non-user branch leaf.
2. Pi navigates to that leaf without mutating the draft.
3. System refreshes state and focuses the input.
4. User sends a message; Pi appends it as a child of that branch leaf.



## Acceptance Criteria

1. Linear and branched sessions render without excessive horizontal drift.
2. Branch segment connectors render independently from chevrons.
3. Clicking a row body does not change `leafId`, conversation item count, or draft text.
4. Clicking Branch on a tree user node or conversation user message fills the input with the original message text.
5. Sending the Branch draft creates a sibling branch in the same session tree.
6. Clicking Continue on a non-current terminal non-user branch leaf switches `leafId` to that leaf and preserves the draft.
7. User-message leaves do not show Continue; they keep the Branch affordance.
8. Sibling order remains stable after select, Branch, Continue, refresh, and sync.
9. Sidebar no longer duplicates session title/model; the app header remains the canonical display.
10. Sidebar resize, collapse, search, and scroll-current continue to work.
11. Draft replacement confirmation appears when Branch is clicked while input contains text; Continue never asks because it never overwrites draft.
12. UI and docs use Branch/Continue for same-session `navigate_tree`; Fork is reserved for future new-session behavior.
