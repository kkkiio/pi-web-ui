# ADR 0013: Explicit Web UI Session Activation

## Status

Accepted

## Context

Installing Pi Web UI should leave the user's terminal workflow intact until they
explicitly choose to use the browser. Once enabled, Pi Web UI provides model
instructions for the browser's interactive features. The user can continue the
same conversation in the terminal after the server stops.

## Decision

**`/webui` enables browser features and DIL instructions for the current session.
`/webui-stop` releases those resources and preserves the conversation.**

### Before activation

Loading the extension may register commands and passive lifecycle hooks needed
for activation. Until the user runs `/webui`, Pi Web UI must not:

- Start an HTTP or WebSocket server, open a browser, or start background services.
- Register its own agent tools, even with `defaultActive: false`.
- Change existing tools' activation, model instructions, or conversation context.
- Intercept third-party question flows or replace another extension's behavior.

Automatic startup must not bypass this boundary.

### After activation

`/webui` starts the HTTP and WebSocket server and enables message editing and
DIL instructions for the current session. Continue in the browser to use the
interactive cards. The server remains available when a browser disconnects.

### Interactive clarification

Pi asks clarifying questions in an assistant response and ends its turn so the
user can reply. A DIL card can submit an answer as the next normal user message.
Tool availability continues to follow the Pi session's configuration and
loaded extensions.

### Cleanup and session boundaries

`/webui-stop` closes connections and servers and releases activation-owned
timers, listeners, and DIL instructions. Conversation history is preserved.

Activation belongs to the current session. New, switched, or forked sessions and
`/reload` require `/webui` again. Leaving an activated session performs cleanup;
an existing server must not silently activate the next session. Process shutdown
also releases Web UI resources. Repeated activation and cleanup must be safe.

If activation fails, release resources acquired by that attempt.

## Verification

- Before `/webui`, the terminal session retains its tools and model instructions.
- Activation starts the server and enables DIL instructions.
- Stop, session replacement, reload, and failed startup release resources.
- Repeated start and stop cycles preserve conversation history.

## References

- [ADR 0002: Raw Web UI Event Forwarding](0002-web-ui-extension-event-protocol.md)
- [ADR 0006: Single-Session Scope](0006-project-scope-single-session-web-ui.md)
- [ADR 0012: Interactive Agent UI Positioning](0012-interactive-agent-ui-positioning.md)
- [Issue #21: AskUserQuestion](https://github.com/kkkiio/pi-web-ui/issues/21)
