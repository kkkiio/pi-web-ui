# ADR 0009: Frontend State Management — Zustand Slices + Local UI State

## Status

Accepted and implemented

## Context

The original `app.tsx` owned too many responsibilities at once:

1. WebSocket connection, reconnect, pending requests, and request/response matching
2. `state_sync` snapshot application
3. streaming assistant message and tool execution updates
4. workspace git status and Markdown artifact recovery
5. right panel tabs and file/diff loading
6. model, thinking, theme, auth, dialog, and session settings
7. page layout plus local interface state

That shape made cross-boundary features expensive. A small Workspace Status Float change could require touching transport code, session event code, UI state, and right panel state in one component.

## Decision

Use Zustand as the frontend domain-state owner, with local React state reserved for short-lived interface controls.

The implemented shape is:

```text
WebSocket / RPC
  -> PiClient
  -> event-dispatch
  -> Zustand store slices
  -> React layout and UI components
```

`PiClient` owns browser transport behavior:

- WebSocket connect/reconnect
- queued requests before connection is open
- pending request map for `req` / `res`
- event forwarding into the store dispatcher
- prompt response notification so submitted chat state can return to ready

`event-dispatch.ts` owns protocol event routing. It receives raw `WsEvent` values and calls store actions. The extension still forwards Pi events unchanged; the browser remains responsible for product interpretation.

## Store Slices

Zustand lives under `src/web/src/core/store/`.

| Slice | Owns |
|-------|------|
| `connection-slice.ts` | `PiClient`, connection state, top-level errors, advanced feature flags, `send()` |
| `session-slice.ts` | chat items, chat status, session tree, selected/loading tree entry, sync state, usage, streaming assistant/tool events |
| `workspace-slice.ts` | git status, git loading state, Markdown artifacts, debounced git refresh |
| `right-panel-slice.ts` | tab list, active tab, visibility, restore affordance, git diff loading, artifact file loading |
| `settings-slice.ts` | available/current model, thinking level, session name, theme, auth, arch mode, remote settings commands |
| `dialog-slice.ts` | extension UI request dialog and response command |

`src/web/src/core/store/index.ts` composes the slices into `usePiWebUiStore`.

## Local UI State

`app.tsx` still owns local state when the state is ephemeral and not a product-level domain source:

- left sidebar width and open state
- system dark-mode media query result
- current input draft and queued prompt drafts
- model/settings/command/context popover open state
- model search text
- highlighted entry id and focus refs
- DOM refs used for scroll/focus behavior

This keeps global state from absorbing transient view mechanics while still moving WebSocket, session, workspace, right-panel, settings, and dialog state into one coherent store.

## Action Design

Protocol and domain updates should go through intent-level actions:

```ts
applyStateSync(sync)
applyMessageStart(event)
applyMessageUpdate(event)
applyToolExecutionEnd(event)
openGitDiff()
openArtifact(artifact)
refreshSettingsState()
sendPrompt(command)
```

Small setters are acceptable for simple fields that have no protocol interpretation, such as selected tree entry, theme mode, or dialog value. Event handlers should avoid rebuilding state transitions inline in React components.

## Implemented Files

```text
src/web/src/core/pi-client.ts
src/web/src/core/store/
src/web/src/core/store/event-dispatch.ts
src/web/src/app.tsx
```

The UI component directories remain:

```text
src/web/src/components/pi-web-ui/
src/web/components/ai-elements/
src/web/components/ui/
```

## Consequences

Positive:

- `state_sync` applies session state, tree state, model state, usage, and artifacts atomically.
- Streaming text, tool call state, and tool result state update through store actions rather than React component setters.
- Workspace Status Float and Right Panel share the same artifact/git state.
- Right Panel tab lifecycle is centralized, including hidden/restored behavior.
- Real Pi E2E can exercise the same browser state path used in normal sessions.

Costs:

- Zustand is now a runtime dependency.
- Slice boundaries require discipline during review.
- `app.tsx` still coordinates layout and local view interactions; further component extraction should preserve the domain boundaries defined here.

## Alternatives Considered

| Option | Decision |
|--------|----------|
| One monolithic Zustand store file | Rejected because ownership would blur as features grow |
| Jotai / atom state | Rejected because one Pi event often needs atomic multi-field updates |
| EventBus singleton | Rejected because ownership and lifecycle would be implicit |
| Keep all state in React local state | Rejected because `state_sync`, streaming events, workspace artifacts, and right-panel state cross feature boundaries |

## Verification

The implemented migration is covered by:

- `npx tsc --noEmit`
- `npm run check`
- `npm run e2e`
- `$webui-visual-check` screenshots for Workspace Status Float and Right Panel on desktop and mobile viewports

## References

- [Zustand — Bear necessities for state management](https://github.com/pmndrs/zustand)
- [Zustand slices pattern](https://docs.pmnd.rs/zustand/guides/slices-pattern)
