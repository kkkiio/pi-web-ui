# ADR 0013: Explicit Web UI Session Activation

## Status

Accepted

## Context

Installing Pi Web UI should leave the user's terminal workflow intact until they
explicitly choose to use the browser. Once enabled, interactive features need to
change the session's tools and model instructions. Those changes can leave
lasting effects in the conversation, even after the server stops.

The activation boundary should make these effects predictable without requiring
Pi Web UI to reproduce every third-party tool's behavior or undo conversation
history.

## Decision

**Before `/webui`, Pi Web UI does not affect the session's behavior. After
`/webui`, it may change the session environment, and those changes may leave
lasting effects. Stopping performs normal cleanup, not a rollback of history.**

### Before activation

Loading the extension may register commands and passive lifecycle hooks needed
for activation. Until the user runs `/webui`, Pi Web UI must not:

- Start an HTTP or WebSocket server, open a browser, or start background services.
- Register its own agent tools, even with `defaultActive: false`.
- Change existing tools' activation, model instructions, or conversation context.
- Intercept third-party question flows or replace another extension's behavior.

Automatic startup must not bypass this boundary.

### After activation

`/webui` starts the HTTP and WebSocket server and enables Web UI features for the
current session. These features may register tools, change tool activation, and
add model instructions and conversation entries as needed.

**The recommended workflow is to continue the activated session in Web UI.**
Pi Web UI does not promise that browser-specific interactions also work in the
terminal while it owns them. Closing a browser tab or losing its connection does
not itself deactivate the session.

### Tool ownership

AskUserQuestion uses Pi Web UI's own `webui_ask_user_question` tool. Activation
records which tools from an explicit conflict-name list are active, disables
those tools, and enables the Web UI tool. The initial conflict list contains
only `ask_user_question`.

Pi Web UI does not infer conflicts from tool descriptions, replace unrelated
tools, or depend on RPIV's schemas, events, validation, or answer management.
Third-party extensions remain loaded; disabling a conflicting tool means
removing its name from Pi's active tool set.

The distinct tool name avoids dependence on extension loading order: Pi 1.5.2
selects the first extension in that order defining a given tool name, so later
registration is not a reliable cross-extension override.

### Cleanup and session boundaries

`/webui-stop` cancels pending Web UI interactions, settles their waiting promises,
closes connections and servers, releases activation-owned timers and listeners,
and disables Web UI tools. It restores only conflicting tools that were active
and disabled by this activation, preserving unrelated tool changes.

Cleanup does not remove tool calls, answers, messages, or their effects on the
LLM context. A tool registered during an earlier activation may remain registered
but inactive because Pi has no public tool-unregistration API. Deactivation
does not promise to recreate a process in which Web UI was never enabled.

Activation belongs to the current session. New, switched, or forked sessions and
`/reload` require `/webui` again. Leaving an activated session performs cleanup;
an existing server must not silently activate the next session. Process shutdown
also releases Web UI resources. Repeated activation and cleanup must be safe.

If activation fails, release resources acquired by that attempt and restore the
tool activation changes it made.

## Consequences

- Users can install the extension and keep their existing workflow until they
  explicitly enable it.
- Web UI owns its interactive tools after activation and can evolve them without
  a third-party compatibility adapter. RPIV is neither a runtime dependency nor
  an optional AskUserQuestion backend.
- Stopping restores operational tool availability while preserving conversation
  history and model context effects.
- Product documentation must explain explicit activation, cleanup, and the
  recommendation to continue activated sessions in the browser.
- The single-session scope and thin event transport rules remain in force.

## Verification

- Before `/webui`, no server is listening, no Web UI tool is registered, and the
  existing active tools and model instructions are unchanged.
- Activation enables `webui_ask_user_question` and disables only active tools on
  the conflict list, regardless of whether RPIV is installed or its load order.
- Stop, session replacement, reload, and failed startup release resources and
  restore the affected tool activation state. Previously inactive conflict tools
  stay inactive; unrelated changes survive cleanup.
- Repeated start/stop cycles work, and completed interactions remain in history.

## References

- [ADR 0002: Raw Web UI Event Forwarding](0002-web-ui-extension-event-protocol.md)
- [ADR 0006: Single-Session Scope](0006-project-scope-single-session-web-ui.md)
- [ADR 0012: Interactive Agent UI Positioning](0012-interactive-agent-ui-positioning.md)
- [Issue #21: AskUserQuestion](https://github.com/kkkiio/pi-web-ui/issues/21)
