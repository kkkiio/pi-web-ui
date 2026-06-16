# AGENTS.md

Pi extension that mirrors the terminal session in the browser — WebSocket + HTTP server inside Pi, React frontend.

**Location:** `AGENTS.md` at the repository root.

## Table of Contents

1. [Policies & Mandatory Rules](#policies--mandatory-rules)
2. [Project Structure Guide](#project-structure-guide)
3. [Operation Guide](#operation-guide)

## Policies & Mandatory Rules

### Two context types — `latestCtx` and `latestExecuteCtx`

Pi has **two distinct context types** with different capabilities:

| Context | Variable | Source | Capabilities |
|---------|----------|--------|-------------|
| `ExtensionContext` | `latestCtx` | Event callbacks (`pi.on(...)`) | `ui`, `sessionManager`(read), `model`, `cwd`, `isIdle()`, `abort()`, `shutdown()`, `getContextUsage()`, `compact()` |
| `ExtensionCommandContext` | `latestExecuteCtx` | `/webui` command handler capture | All of the above **+** `navigateTree()`, `newSession()`, `fork()`, `switchSession()`, `waitForIdle()`, `reload()`, `getSystemPromptOptions()` |

`navigateTree` and other session-control methods **only exist on `ExtensionCommandContext`**. Pi's author deliberately restricts them to command handlers. See [ADR 0003](adrs/0003-navigate-tree-via-captured-command-context.md) for the full workaround design.

**Rule — use the right context for the right job:**
- Reading state, forwarding events, UI notifications → use `latestCtx`
- Session control (`navigateTree`, `fork`, etc.) → use `latestExecuteCtx`, check for `null` first
- Both are cleared on `session_start` and `session_shutdown`; `latestExecuteCtx` requires user to re-run `/webui`

### `latestCtx` — Never use captured `ctx` in long-lived closures

The Pi extension runner **invalidates** `ExtensionContext` after session replacement, fork, switch, or reload. Any closure that captures a `ctx` parameter and uses it after one of those operations will throw:

> This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload().

**Rule**: `extensions/mirror-server.ts` uses a module-level `latestCtx` variable. Every Pi event callback updates it with the fresh `ctx`.

**All code that may run after a session lifecycle event** — WebSocket `close`/`error`/`connection` handlers, `setInterval` timers, async callbacks from external sources — must use `latestCtx`, never a captured `ctx` parameter.

The same stale-context rule applies to `latestExecuteCtx`. After session replacement, any captured `ExtensionCommandContext` becomes stale and must be re-captured via `/webui`.

Apply this rule when you:
- Add or modify any closure in `extensions/mirror-server.ts` that references `ctx`
- Add a new `pi.on(...)` handler that doesn't update `latestCtx`
- Use `ctx.ui`, `ctx.sessionManager`, `ctx.cwd`, or any other `ctx` property inside `setInterval`, `setTimeout`, WebSocket event handlers, or command handlers
- Add a new command handler that captures `ExtensionCommandContext` — must update `latestExecuteCtx`

Skip for:
- Synchronous code that runs immediately inside a `pi.on(...)` callback body, before any `await`
- Code that only uses `pi` (the `ExtensionAPI`), not `ctx`

### Extension output — `ctx.ui.setStatus` / `ctx.ui.notify` only

Per `adrs/0001-pi-extension-output-policy.md`: never write to `stdout`/`stderr` from extension code. Use `ctx.ui.setStatus(...)` for persistent state and `ctx.ui.notify(...)` for one-shot user messages. Use `latestCtx`, not a captured `ctx`.

### Event forwarding — thin transport

Per `adrs/0002-web-ui-extension-event-protocol.md`: Mirror Server forwards events unchanged. Never interpret extension payloads into Pi Web UI product concepts inside the extension. The browser owns feature interpretation. inside the extension. The browser owns feature interpretation.

### Release workflow — `RELEASING.md` is authoritative

Apply when you:
- Publish `@kkkiio/pi-web-ui` to npm
- Bump package versions or prepare release commits
- Change `package.json` fields that affect npm packaging, `pi.image`, `files`, `prepare`, `prepack`, or `publishConfig`
- Investigate pi.dev package catalog images or README rendering

Before running `npm pack`, `npm version`, `npm publish`, or release-tag commands, read `RELEASING.md` and follow its checklist. Do not run `npm publish` without explicit user approval in the current task.

Skip for local development builds and checks that are not intended for a release.

### Mandatory Skill Usage

## Project Structure Guide

### Overview

Pi Web UI is a Pi extension package (`npm:@kkkiio/pi-web-ui`). It starts an HTTP + WebSocket server inside the Pi process and serves a React frontend built with Vite.

### Repo Structure & Important Files

```
.
├── adrs/                        # Architecture Decision Records (必读)
│   ├── 0001-pi-extension-output-policy.md          # Extension output rules (no stdout/stderr)
│   ├── 0002-web-ui-extension-event-protocol.md     # Web UI event forwarding protocol
│   ├── 0003-navigate-tree-via-captured-command-context.md # latestCtx vs latestExecuteCtx workaround
│   ├── 0004-web-ui-access-bind-address.md          # Server bind address policy
│   ├── 0005-intercepted-command-ui-lifecycle.md    # Intercepted command UI state handling
│   ├── 0006-project-scope-single-session-web-ui.md # Single-session scope definition
│   ├── 0007-npm-publish-distribution-strategy.md   # npm publish + dist/ strategy
│   ├── 0008-unified-websocket-protocol.md          # WebSocket req/res/event protocol
│   └── 0009-frontend-state-management-hybrid-zustand.md # Zustand + local state hybrid
├── prds/                        # Product Requirement Documents (功能设计)
│   ├── arch-mode-ui.md          # Architecture mode toggle UI
│   ├── tree-sidebar.md          # Conversation tree sidebar
│   ├── columns-layout.md        # Multi-column layout design
│   ├── branch-message.md        # Branch from user messages
│   ├── left-sidebar.md          # Left sidebar design
│   ├── subagent-integration.md  # Sub-agent status display
│   └── workspace-status-float.md # Workspace status floating indicator
├── extensions/
│   ├── mirror-server.ts         # Main extension: HTTP + WS server + all event handling
│   └── imessage-bridge.ts       # iMessage integration extension
├── src/web/                     # React frontend source
│   ├── index.html               # Vite entry HTML
│   ├── index.css                # Global styles (Tailwind)
│   ├── src/
│   │   ├── main.tsx             # React entry point
│   │   ├── app.tsx              # Root App component
│   │   ├── core/
│   │   │   ├── ws.ts            # WebSocket client for browser ↔ extension
│   │   │   ├── types.ts         # TypeScript types for WebSocket protocol
│   │   │   ├── chat-conversion.ts # Converts raw events → UI message models
│   │   │   ├── format.ts        # Display formatting utilities
│   │   │   ├── subagents.ts     # Sub-agent data handling
│   │   │   ├── tool-summary.ts  # Tool call summary rendering
│   │   │   └── constants.ts     # Shared constants
│   │   └── components/
│   │       ├── pi-web-ui/       # Pi Web UI components
│   │       │   ├── chat-item-view.tsx    # Main chat message renderer
│   │       │   ├── conversation-sidebar.tsx     # Session tree sidebar
│   │       │   ├── conversation-sidebar-tree.tsx # Tree view component
│   │       │   ├── command-palette.tsx   # Command palette
│   │       │   ├── subagent-detail-sidebar.tsx
│   │       │   ├── model-picker.tsx
│   │       │   ├── settings-panel.tsx
│   │       │   ├── context-popover.tsx
│   │       │   ├── workspace-status-float.tsx
│   │       │   ├── user-message-view.tsx # User message with Branch button
│   │       │   └── ...
│   │       ├── ai-elements/     # AI Elements components (conversation, message, tool, reasoning, etc.)
│   │       └── ui/              # shadcn/ui primitives (button, dialog, input, etc.)
│   └── lib/
│       └── utils.ts             # shadcn/ui utility (cn helper)
├── public/                      # Static assets copied by Vite (icons, manifest, sw.js)
├── dist/                        # Vite build output (gitignored)
├── docs/images/                 # Screenshots for README
├── MOBILE.md                    # Mobile access guide
├── RELEASING.md                 # npm publish and pi.dev verification checklist

├── package.json                 # npm package config + pi extension manifest
├── tsconfig.json                # TypeScript config (only src/web + vite.config.ts)
├── vite.config.ts               # Vite config (dev proxy to :3001, build to dist/)
├── biome.json                   # Biome formatter/linter config
└── justfile                     # just tasks (fmt, check)
```

### Architecture: Extension ↔ Frontend Communication

```mermaid
graph LR
    A[Pi TUI<br/>terminal] <-->|Pi events| B[Pi Process<br/>mirror-server.ts]
    B <-->|HTTP + WS :3001| C[Browser]
```

- **Extension (`mirror-server.ts`)**: subscribes to Pi events via `pi.on(...)`, forwards them to browser WebSocket clients. Accepts commands from browser, executes via extension API.
- **Frontend (`src/web/`)**: React + Vite + Tailwind. Connects to extension via WebSocket. Converts raw events to UI models in `chat-conversion.ts`.
- **Dev proxy**: `vite dev` on `:4444` proxies `/api` → `:3001` and `/ws` → `ws://localhost:3001`.

### Key Design Patterns

#### 1. `latestCtx` — stale context guard

The `ctx` parameter in Pi event callbacks is invalidated on session replacement. See Policies section for full rules.

#### 2. Event envelope

All WebSocket messages to the browser use:

```json
{ "type": "event", "event": { "type": "<event-name>", ... } }
```

Pi core events carry their native fields. Extension-bus events nest under `event.payload`.

#### 3. State snapshot on connect

When a browser WebSocket connects, `buildStateSnapshot(latestCtx)` sends full session state (messages, model, session info, tool calls). After that, incremental events keep the UI in sync.

#### 4. Commands from browser → extension

Browser sends JSON commands over WebSocket. Commands invoke Pi extension API methods (send message, cancel, set model, etc.) through `latestCtx`.

## Operation Guide

### Prerequisites

- Node.js >= 18
- npm

### Development Workflow

#### Frontend development

Run Pi with Pi Web UI on its normal port in one terminal, then:

```bash
npm run dev:web
```

Open `http://localhost:4444`. Vite serves the React UI and proxies `/api` and `/ws` to the Pi Web UI extension on `localhost:3001`.

#### Build for production

```bash
npm run build:web
```

Output goes to `dist/`. Then run Pi with the built assets:

```bash
PI_WEB_UI_STATIC_DIR=$(pwd)/dist pi
```

#### Install dependencies

```bash
npm install
```

### Testing & Checks

Run before committing:

```bash
just check
```

This runs `biome check .` (format + lint). To format only:

```bash
just fmt
```

To lint only:

```bash
npm run lint
```

### Publishing

For npm releases, read and follow `RELEASING.md` before changing package release metadata or running publish commands.

```bash
npm pack --dry-run --json
```

### Key Files to Update Together

When adding a new WebSocket event type from the extension to the browser:

1. `extensions/mirror-server.ts` — emit the event
2. `src/web/src/core/types.ts` — add the TypeScript type
3. `src/web/src/core/chat-conversion.ts` — add conversion logic if it affects chat display
4. Corresponding React component in `src/web/src/components/pi-web-ui/`

When adding a new browser → extension command:

1. `src/web/src/core/ws.ts` — add the send function
2. `extensions/mirror-server.ts` — add the command handler (use `latestCtx`)
3. `src/web/src/core/types.ts` — add the type

### Reference

- Pi RPC docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/rpc.md`
- Pi SDK docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
- Pi JSON mode: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/json.md`
- Pi session docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md`
