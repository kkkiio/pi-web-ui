# Configuration

Pi Web UI runs inside your Pi process. Run `/webui` to start it on
`http://127.0.0.1:3001` and continue the current session in the browser. Before
activation it does not start a server, register agent tools, or change your
existing tools or model instructions.

## Environment Variables

Set before starting `pi`:

| Variable                      | Default       | Description                           |
| ----------------------------- | ------------- | ------------------------------------- |
| `PI_WEB_UI_PORT`              | `3001`        | HTTP & WebSocket server port          |
| `PI_WEB_UI_HOST`              | `127.0.0.1`   | Server bind address                   |
| `PI_WEB_UI_STATIC_DIR`        | _(bundled)_   | Override static frontend assets path  |
| `PI_CODING_AGENT_DIR`         | `~/.pi/agent` | Override Pi config directory          |
| `PI_CODING_AGENT_SESSION_DIR` | _(derived)_   | Override Pi session storage directory |

## `settings.json`

You can also configure `port` and `host` in `~/.pi/agent/settings.json`:

```json
{
  "pi-web-ui": {
    "port": 3001,
    "host": "127.0.0.1"
  }
}
```

Pi Web UI respects `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` overrides when reading settings and session state.

## Slash Commands (Start / Stop)

Inside the Pi TUI:

| Command        | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `/webui`       | Start the server, enable Web UI tools and editing, and open the browser     |
| `/webui-stop`  | Cancel pending questions, stop the server, and restore affected tools       |

Run `/webui` again to restart. The former `/webui-start` command and auto-start
configuration (`PI_WEB_UI_DISABLED` / `pi-web-ui.disabled`) are no longer used;
activation is always explicit. Enable Web UI while the agent is idle.

### AskUserQuestion

Activation registers `webui_ask_user_question` and disables the known conflicting
tool name `ask_user_question` if it is active. Pi Web UI owns the question flow;
no RPIV integration or installation is required. The agent can ask 1–4 questions
with 2–4 choices each, optional Markdown previews, multiple selection, and custom
text answers. It waits until you submit, cancel, or abort the task.

Reloading the page or connecting another browser restores pending questions.
The first valid answer wins. A disconnected browser keeps its local draft until
reconnection; reloading the page starts a fresh draft. Closing all browser tabs
does not stop the server or resolve pending questions.

Stopping disables the Web UI tool and restores only the conflicting tools that
activation disabled. It preserves unrelated tool changes and does not roll back
conversation history or LLM context. New, switched, and forked sessions and
`/reload` require `/webui` again. See
[ADR 0013](adr/0013-explicit-webui-session-activation.md) for the activation policy.

## Security & Remote Access

Pi Web UI binds to `127.0.0.1` by default — accessible only from your local machine.

- For remote or mobile access, use `tailscale serve` or a reverse proxy with TLS (see [MOBILE.md](https://github.com/kkkiio/pi-web-ui/blob/main/MOBILE.md)).
- There is no built-in HTTP Basic Auth; it is unnecessary for localhost access and insecure over cleartext.
