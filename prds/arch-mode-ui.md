# PRD: Architecture Mode UI Switch

**Status:** Draft
**Date:** 2026-06-11

## Problem

The Architecture Mode extension (`@kkkiio/pi-arch-mode`) adds a `/arch` slash command to Pi. Users need a visible, always-accessible way to toggle architecture mode in the Web UI, without typing slash commands.

Currently there is no UI for this. The user must remember the `/arch` and `/arch-off` commands. Additionally, if the arch-mode extension is not installed, we should not show a non-functional switch that silently does nothing.

## Design Goals

1. **Persistent toggle** — a switch in the input toolbar that is always visible when arch-mode is available
2. **Bidirectional sync** — switch reflects current mode state; clicking switch changes mode
3. **Graceful absence** — switch is hidden entirely when arch-mode extension is not loaded
4. **Minimal visual weight** — doesn't distract from the primary input area

## UI Specification

### Placement

Inside `PromptInputTools`, to the left of the attachment button:

```
[🏗️ ●――――]  [📎]  Enter sends, Shift+Enter…        [↓]
```

### States

| State | Visual |
|---|---|
| **Hidden** | Arch-mode extension not loaded — switch is absent |
| **Off** | `🏗️` icon muted, switch track gray, thumb left |
| **On** | `🏗️` icon accent, switch track primary color, thumb right |
| **Hover (off)** | Border transitions to accent |
| **Disabled** | 50% opacity (when disconnected) |
| **Focus** | Ring outline |

### Tooltip

- Off: "Architecture Mode"
- On: "Exit Architecture Mode"

## Detection: How We Know arch-mode Is Loaded

### Problem

`mirror-server` and `arch-mode` are separate extensions. The browser needs to know whether `arch-mode` is loaded before showing the switch. But there is no built-in extension discovery API in Pi.

### Solution: `arch:ready` handshake

On `session_start`, `arch-mode` emits a presence announcement:

```
arch-mode:  pi.events.emit("arch:ready")
mirror-server:  pi.events.on("arch:ready") → sets hasArchMode=true
mirror-server:  broadcast({ type: "state", archAvailable: true })
browser:  sets archAvailable=true → shows switch
```

This is followed by the existing state broadcast (if already enabled):

```
arch-mode:  pi.events.emit("arch:state-changed", { enabled })
mirror-server:  broadcast event
browser:  sets archModeEnabled → switch turns on
```

### Timing

- `session_start` fires after all extensions have registered their `pi.events` listeners
- `arch:ready` is emitted in `session_start`, so mirror-server's listener is already active
- `arch:state-changed` follows (if mode was persisted), so the browser gets both events in the correct order

## Communication Protocol

### Browser → Server (WebSocket commands)

| Command | Payload | Effect |
|---|---|---|
| `enter_arch_mode` | (none) | mirror-server emits `cmd:arch:enter` on pi.events |
| `exit_arch_mode` | (none) | mirror-server emits `cmd:arch:exit` on pi.events |

### Server → Browser (WebSocket events)

| Event | Payload | Effect |
|---|---|---|
| `state` | `{ archAvailable: true }` | Browser shows the switch |
| `arch:state-changed` | `{ enabled: boolean }` | Browser updates switch position |

### arch-mode → pi.events (internal)

| Event | Emitted by | Listened by |
|---|---|---|
| `arch:ready` | arch-mode `session_start` | mirror-server |
| `arch:state-changed` | arch-mode on enter/exit | mirror-server → browser |
| `cmd:arch:enter` | mirror-server → pi.events | arch-mode |
| `cmd:arch:exit` | mirror-server → pi.events | arch-mode |

## Edge Cases

1. **Arch-mode not installed** — no `arch:ready` emitted, switch never appears. User sees no arch UI.
2. **Arch-mode installed but not enabled** — switch appears in off position after `arch:ready`.
3. **Arch-mode enabled from previous session** — `arch:state-changed` fires after `arch:ready`, switch animates to on.
4. **Browser reconnects** — mirror-server sends latest state. We need to persist `archAvailable` in mirror-server so reconnecting clients see it.
5. **Arch-mode loaded after mirror-server** — `session_start` ordering is guaranteed by Pi: all extension factories run first, then `session_start` fires for each. `pi.events` listeners registered in factories are active before any `session_start`. So if arch-mode is loaded, its `arch:ready` will be received.

## Implementation Plan

### Phase 1: Presence detection (this PR)

1. **`arch-mode.ts`** — add `pi.events.emit("arch:ready")` in `session_start`
2. **`mirror-server.ts`** — listen for `arch:ready`, set `archExtensionPresent`, broadcast to clients
3. **`app.tsx`** — add `archAvailable` state (default `false`), handle `state.archAvailable` in WS message dispatch
4. **`chat-input.tsx`** — conditionally render `ArchModeToggle` only when `archAvailable`

### Phase 2: Future improvements

- **Optimistic toggle** — immediately update switch position on click, revert if no `arch:state-changed` within timeout
- **Error feedback** — if `enter_arch_mode` fails (e.g., arch-mode extension unloaded mid-session), show toast
- **Keyboard shortcut** — `Cmd+Shift+A` to toggle arch mode
