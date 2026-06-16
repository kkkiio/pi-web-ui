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

A persistent toggle in the chat input toolbar, to the left of the attachment button:

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

## Edge Cases

1. **Arch-mode not installed** — switch never appears. User sees no arch UI.
2. **Arch-mode installed but not enabled** — switch appears in off position.
3. **Arch-mode enabled from previous session** — switch animates to on position on load.
4. **Browser reconnects** — server sends latest arch-mode state so reconnecting clients see the correct switch position.
5. **Arch-mode loaded after mirror-server** — Pi's session lifecycle ordering ensures arch-mode announces its presence before any UI queries it.

## Future Improvements

- **Optimistic toggle** — immediately update switch position on click, revert if no confirmation within timeout
- **Error feedback** — if entering/exiting arch mode fails (e.g., arch-mode extension unloaded mid-session), show toast
- **Keyboard shortcut** — `Cmd+Shift+A` to toggle arch mode
