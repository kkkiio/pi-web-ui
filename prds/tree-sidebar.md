# PRD: Conversation Tree Sidebar

## Overview

Replace the current session history sidebar with a conversation tree view that visualizes the current session's branching structure. Users can see the conversation tree, navigate between branches, and fork user messages from the main conversation stream.

**Status**: Proposed
**Replaces**: Session History sidebar (see ADR 0007)
**Depends on**: ADR 0008 (Unified WebSocket Protocol)

---

## User Stories

### Epic 1: Tree Visualization

**US-1.1 — See conversation structure**
As a developer using Pi Web UI, I want to see the tree structure of my current conversation in the sidebar so I can understand how the conversation has branched.

- The tree shows all messages in the current session as nodes
- Nodes are connected by lines showing parent→child relationships
- The active branch (root → current leaf) is visually highlighted
- Branch points (nodes with multiple children) are marked with a visual indicator
- Child nodes are sorted by timestamp (oldest first)

**US-1.2 — Identify user operations first**
As a developer, I want my own inputs and commands to stand out because they are the memorable edit, rollback, and fork anchors.

- User input/command nodes use a thin blue accent rail and stronger text, without a tinted row background
- Agent/tool/system nodes stay visually quieter and rely on compact text summaries
- Branch disclosure uses the normal tree chevron only when a node can expand
- Per-row type icons are intentionally omitted to preserve horizontal space and reduce visual noise

**US-1.3 — Read conversation flow**
As a developer, I want to read the conversation linearly along the active path, with branch summaries indicating what was explored on abandoned branches.

### Epic 2: Tree Navigation

**US-2.1 — Navigate to a tree node**
As a developer, I want to click any tree node to navigate the session to that point, so I can explore past branches or review earlier conversation context.

- Clicking a node calls `navigate_tree` with that node's entry ID
- Navigation triggers a `state_sync` event that updates the conversation list and tree
- **The chat input box is NOT modified** — protecting any draft message the user may be composing
- The tree view re-renders with the browsed/current node selected and rows after the current-position divider muted
- This is a "browse" action: user is exploring, not necessarily forking

**US-2.2 — Visual feedback during navigation**
As a developer, I want clear visual feedback when navigation is in progress (loading state on the clicked node) or when it fails (error toast).

**US-2.3 — Return to latest leaf**
As a developer, I want a "Return to latest" button in the sidebar header that navigates back to the most recent leaf on the main branch.

**US-2.4 — See current position**
As a developer, I want the current position clearly distinguished from later inactive history, so I always know where I am in the tree.

- Current leaf or explicitly browsed node: selected row styling
- Rows before the current-position divider: normal readable sidebar foreground
- Rows after the divider: reduced emphasis
- No terminal-style dot indicator next to the current leaf

### Epic 3: Editing & Forking

**US-3.1 — Fork a user message from conversation actions**
As a developer, I want to click the "Fork" button under a user message in the conversation stream, replacing the previous edit-message action, so I can modify and re-send that message to create a new branch from that point.

- User messages in the main conversation stream show a Fork icon in the message actions row
- The left tree node body remains browse-only and never populates the input
- Clicking the Fork button triggers:
  1. `navigate_tree` with that user message's own entry ID; Pi positions the session just before the message
  2. The conversation list refreshes to show messages **up to that point** (the target message itself may be shown as the last item or ghosted)
  3. The original message text is populated into the **main chat input box** (prefilled, editable)
  4. User modifies the text and clicks Send
  5. System sends `prompt` with the new text, creating a fork
- After successful fork, the tree updates via `state_sync` to show the new branch
- A subtle confirmation (toast or inline text) explains: "Forking from [timestamp]. Your previous branch is preserved."

**US-3.2 — Distinguish between browse and fork**
As a developer, I want a clear distinction between clicking a tree node (to browse/review) and clicking the Fork button (to fork), so I don't accidentally overwrite my in-progress input.

| Action | Triggers | Navigates | Populates input? |
|--------|----------|-----------|------------------|
| Click tree node | Single click on node body | ✅ Yes | ❌ No (preserves draft) |
| Click Fork button | Click the ⎇ icon under a user message in conversations | ✅ Yes (to parent) | ✅ Yes (prefills with original text) |

**US-3.3 — Understand fork consequences**
As a developer, I want a brief confirmation or tooltip explaining that forking a past message will create a new branch (the current branch is preserved).

### Epic 4: Tree Interaction

**US-4.1 — Collapse / expand branches**
As a developer, I want to collapse branches I'm not interested in, so I can focus on a specific branch.

- Branch points with multiple children default to showing first child only
- A "[+N more]" indicator shows how many hidden children exist
- Clicking the indicator expands all children
- Collapse/expand state persists within the session (not across page reloads)

**US-4.2 — Scroll to current leaf**
As a developer with a large tree, I want a "scroll to current" button that scrolls the tree view to the current leaf node.

**US-4.3 — Search / filter tree nodes**
As a developer, I want to filter the tree to show only nodes matching my search term, so I can quickly find a specific message.

- Search filters by node text content
- Search also matches node detail text such as file paths, commands, and Agent descriptions
- Non-matching branches are hidden
- Clearing the search restores the full tree
- Search is client-side (no server round-trip)

### Epic 5: Visual Design

**US-5.1 — Consistent with Pi Web UI theme**
As a developer, I want the tree to use the same color scheme, spacing, and typography as the rest of Pi Web UI.

- Uses Tailwind tokens from the existing theme
- Supports dark/light mode via CSS variables
- Tree lines use `border` color (muted)

**US-5.2 — Responsive sidebar**
As a developer on a smaller screen, I want the tree to remain usable when the sidebar is at its minimum width.

- On desktop/tablet widths, the conversation tree sidebar opens by default so the current session tree is immediately visible
- On narrow mobile widths, the sidebar may start collapsed to preserve chat space
- At narrow widths, node text truncates with ellipsis
- Icons remain visible (they convey type)
- Long messages show first 60 characters only

**US-5.3 — Smooth transitions**
As a developer, I want current-row selection and the current-position divider to transition smoothly when navigating between nodes.

---

## Functional Requirements

### FR-1: Data Source

- Tree data comes from `state_sync` event payload (see ADR 0008)
- `tree: SessionTreeNode[]` — recursive tree structure from `ctx.sessionManager.getTree()`
- `leafId: string | null` — current position in tree
- Tree updates on: WebSocket connect (full state), `session_tree` event (after navigation)

### FR-2: Compact Tree Rendering

- The sidebar implementation starts from shadcn `sidebar-11` and the generated `ui/sidebar.tsx` primitives; product code should compose those primitives instead of inventing a terminal-style tree list
- The tree prioritizes compactness: dense one-line rows, no per-row type icons, tight indentation, and minimal vertical spacing
- The visual treatment follows a common shadcn/file-tree pattern: chevron expanders, nested depth, tree connectors, hover rows, and active-row styling
- Indentation is based on branch nesting depth, not raw parent-chain depth; long linear conversations must not drift horizontally
- Nested row right edges align with their parent row; indentation is left-only and must not reduce the usable right edge
- Branch points are compact by default: show the active child when available, otherwise show the first chronological child, plus a `+N` indicator for hidden siblings
- Users can expand a branch point to reveal hidden siblings, and collapse it back to the compact form
- Current position: only the current leaf or explicitly browsed node receives selected-row styling
- The current row is followed by a divider; rows after that divider are visually muted, while previous context keeps normal sidebar foreground

### FR-3: Node Components

Each node renders:

| Element | Description |
|---------|-------------|
| Tree line connector | shadcn `SidebarMenuSub` nesting/connector for expanded branch points |
| Branch chevron | Only shown for expandable branch points; non-expandable rows do not reserve icon/chevron space |
| Node text | Truncated first line of message content, assistant action summary, or event name |
| Node detail | Useful same-line muted summary when available: file path for Read/Edit/Write, command for Bash, description/type for Agent, or event/model detail |
| Forkable marker | User input/command rows use a thin blue accent rail and slightly stronger text instead of an icon or tinted background |
| Metadata | Omitted by default; timestamps are intentionally not shown until a higher-signal design is chosen |
| Label badge | If entry has a label (from `getLabel()`) |
| Branch indicator | If entry has multiple children: "[+N]" badge |

**Click targets on a node:**

| Target | Action |
|--------|--------|
| Node body | Browse: navigate to this node, refresh messages, keep input unchanged |

### FR-4: Navigation (click tree node body)

- Click node body → `navigate_tree` request with `{ entryId }` (navigates **to** that node)
- On `ok: true`, server sends `state_sync` event → conversation list and tree refresh
- **Chat input is NOT touched** — user's draft remains intact
- On `ok: false`, show error toast
- Current-position selection and divider move to the clicked node

### FR-5: Fork Flow (click Fork button under conversation user message)

This is a distinct interaction from clicking the tree node body. Pi's `navigateTree` handles the internal positioning logic: when the target is a user message, it automatically sets the leaf to the message's parent and returns the message text as `editorText`.

1. User clicks Fork icon (⎇) under a user message in the main conversation stream
2. System sends `navigate_tree` with `{ entryId: <the user message's own id> }`
3. Server calls `navigateTree(entryId)` — Pi internally:
   - Sets leaf to the user message's **parent** (positions just before the message)
   - Returns `editorText` (the original message text)
4. Server responds with `ok: true, result: { editorText: "..." }`
5. Server sends `state_sync` event → conversation list refreshes to show messages up to the navigation point
6. Frontend places `editorText` into the main chat input box (prefilled, cursor at end)
7. A subtle indicator appears near the input: "Forking from [relative time]"
8. User edits the text and presses Send
9. System sends `prompt` with the new text → new branch is created
10. Tree updates via `state_sync` event showing the new fork

**Edge cases:**
- If user clicks Fork on a different node while a draft exists: confirm before overwriting
- If user clears the input and sends empty: treat as cancellation (no prompt sent)
- If `navigate_tree` fails at step 3: show error, do not touch input
- If `navigate_tree` returns `cancelled: true`: no-op, input unchanged

### FR-6: Empty State

- If tree has only a root and one linear path (no branches): show simplified view — linear timeline with no branch indicators
- If tree has no entries: show "Start a conversation" empty state
- If tree data hasn't arrived yet: show skeleton loading (3 placeholder nodes)

### FR-7: Performance

- Trees up to 500 nodes: render all nodes (no virtualization needed)
- Trees > 500 nodes: use virtual scrolling (render only visible nodes)
- Collapsed branches: children not rendered (DOM savings)

---

## Data Model

### Server → Browser: `state_sync` event

```typescript
interface StateSyncPayload {
  entries: SessionEntry[];       // Current branch for chat messages (existing)
  tree: SessionTreeNode[];       // Full tree for sidebar (NEW)
  leafId: string | null;         // Current position (NEW)
  model: ModelInfo | null;
  thinkingLevel: string;
  sessionName: string;
  sessionFile: string | undefined;
  isStreaming: boolean;
  contextUsage?: ContextUsage;
}
```

### `SessionTreeNode` (from Pi)

```typescript
interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
}
```

### Sidebar-specific derived model

```typescript
interface ConversationTreeItem {
  id: string;
  entryType: string;
  parentId: string | null;
  order: number;
  hasChildren: boolean;
  isLeaf: boolean;
  label?: string;

  // Display
  text: string;
  detail?: string;
  isForkable: boolean;

  // Interaction
  isExpandable: boolean;
  isExpanded: boolean;
  hiddenChildCount: number;
  children: ConversationTreeItem[];
}
```

### Compact tree algorithm

```typescript
function buildConversationTreeItems(args: {
  tree: SessionTreeNode[],
  activePathIds: Set<string>,
  leafId: string | null,
  expandedIds: Set<string>,
  searchQuery: string
}): { currentOrder: number; items: ConversationTreeItem[] }
```

Walk the tree depth-first and build compact render nodes:
1. Sort children chronologically
2. Mark branch points with multiple children as expandable
3. Inline single-child chains at the same sidebar depth so long linear sessions stay compact
4. Keep true branch points as recursive `children`, record `hiddenChildCount`, and render nested shadcn `SidebarMenuSub` content only when expanded or searching
5. Compute `currentOrder` for the visual divider/muted-after-current treatment, then derive `isLeaf` for selected-row focus

---

## Component Architecture

```
SidebarProvider
├── ConversationSidebar         (shadcn Sidebar composition)
│   ├── SidebarHeader           (Pi Web UI branding, collapse trigger)
│   ├── ActiveSessionInfo       (connection dot, session name, model)
│   ├── ConversationSidebarTree (search, scroll-to-current, compact recursive tree)
│   │   └── SidebarMenu/Sub     (shadcn menu rows and nested branch groups)
│   └── SidebarFooter           (settings button)
└── SidebarInset                (main chat surface)
```

### New Files

| File | Purpose |
|------|---------|
| `components/ui/sidebar.tsx` | shadcn sidebar primitives from the `sidebar-11` block |
| `components/ui/breadcrumb.tsx`, `sheet.tsx`, `skeleton.tsx` | shadcn dependencies required by `sidebar-11` |
| `hooks/use-mobile.ts` | shadcn sidebar mobile breakpoint hook |
| `conversation-sidebar.tsx` | Product sidebar shell composed from shadcn `Sidebar*` primitives |
| `conversation-sidebar-tree.tsx` | Compact recursive tree UI using `SidebarMenu`, `SidebarMenuSub`, and `Collapsible` |
| `use-conversation-tree.ts` | Hook: active path, expanded branch state, search, and visible-item collection |
| `conversation-tree-model.ts` | Pure model functions: active path, compact tree items, labels, forkable markers, chronological ordering |

### Modified Files

| File | Change |
|------|--------|
| `app.tsx` | Wrap layout in `SidebarProvider`/`SidebarInset`; remove session-history state; add `tree`/`leafId`; wire browse/fork navigation |
| `user-message-view.tsx` | Replace edit-message action with Fork action that calls `navigate_tree` through App |
| `core/types.ts` | Remove `ProjectGroup`, `SessionInfo`, `SearchResult`, `LaunchProject`; add tree-related types |

### Removed Files

| File | Reason |
|------|--------|
| `session-sidebar.tsx` | Replaced by shadcn-based `conversation-sidebar.tsx` and `conversation-sidebar-tree.tsx` |
| `project-launcher.tsx` | Multi-project feature removed |

---

## UI Behavior Detail

### Two Distinct Interactions: Browse vs Fork

This is the core interaction model of the tree sidebar:

```
┌──────────────────────────────────────────────────────┐
│ Sidebar tree node                                    │
│ ┌──────────────────────────────────────────────┐     │
│ │ ▌ What's the auth setup?                     │     │
│ └──────────────────────────────────────────────┘     │
│        ↑ Click body = Browse                         │
│        → navigate to node                            │
│        → refresh messages                            │
│        → input unchanged                             │
│                                                      │
│ Conversation user message                            │
│ ┌──────────────────────────────────────────────┐     │
│ │ What's the auth setup?                       │     │
│ └──────────────────────────────────────────────┘     │
│                                 [copy] [⎇ Fork]     │
│                                      ↑ Fork          │
│                                      → navigate to   │
│                                        parent        │
│                                      → fill input    │
└──────────────────────────────────────────────────────┘
```

**Design rationale:** A user browsing past branches may have already typed a partial message in the input box. Clicking a tree node to explore should never destroy that draft. The Fork button is an explicit "I want to fork from this user message" action in the main conversation stream — only then do we populate the input.

### Current Position Divider

- The active path entry IDs are still derived by walking from `leafId` to root via `parentId`, but they are used for branch expansion and compacting decisions, not for painting every ancestor as selected
- Only the current leaf or explicitly browsed entry gets selected-row styling
- Render a divider immediately after the current row
- Rows after that divider are muted so later/inactive history reads as outside the current position

### Branch Points

- A node is a "branch point" when it has > 1 child
- Default state: collapsed branch points render as a single parent row plus a `+N` badge for hidden children
- Branch points on the active path are expanded so the current leaf remains visible
- Clicking the chevron expands or collapses the nested `SidebarMenuSub`
- Searching expands matching branches so matching descendants are visible

### Fork Button

- Appears in the action row under user messages in the main conversation stream, replacing the previous edit-message action
- Clicking triggers:
  1. `navigate_tree({ entryId: <user message entry id> })` — navigates to just before the message
  2. Populates main chat input with the returned `editorText`
  3. Focus the chat input
- A subtle indicator appears near the input: "Forking from [relative time]"

### Search/Filter

- Search input at top of tree section
- Debounced (200ms), client-side filter
- Matches against node text (case-insensitive)
- Matching nodes and their ancestors are shown; non-matching branches hidden
- Matching text is highlighted within node text
- Clearing search restores full tree with previous collapse state

### Scroll Behavior

- After `state_sync` event, auto-scroll to current leaf node
- "Scroll to current" button (floating, bottom-right of tree area) appears when leaf is not visible
- User-initiated navigation scrolls to the clicked node

---

## Acceptance Criteria

1. Tree renders correctly for linear sessions (no branches)
2. Tree renders correctly for branched sessions (multiple children under one parent)
3. Current position is visually distinct, with a divider before muted later/inactive rows
4. **Clicking a tree node body**: navigates to that entry, refreshes conversation list, does NOT modify chat input
5. **Clicking Fork button (⎇) under a conversation user message**: navigates to the message's parent, refreshes conversation list, populates chat input with original text
6. Modifying and re-sending the populated message creates a new branch (fork)
7. Branch points show "[+N]" and expand/collapse correctly
8. Search filters nodes and highlights matching text
9. Tree updates live when new messages arrive (agent_end → request state_sync)
10. Dark/light mode works correctly
11. Sidebar collapse/expand works correctly with tree content
12. Empty state renders when tree has no entries
13. Loading state renders while waiting for initial state_sync
14. **Chat input draft is preserved** when clicking tree nodes to browse (not overwritten)

---

## Non-Functional Requirements

- **Performance**: Tree with 200 nodes renders in < 100ms; virtual scroll for > 500 nodes
- **Accessibility**: Nodes are keyboard-focusable; Enter/Space triggers navigation; arrow keys navigate between nodes
- **Error handling**: Failed navigation shows toast; malformed tree data shows degraded compact timeline fallback
- **Memory**: Collapsed branches don't render DOM nodes (only metadata)
