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
| `/webui`       | Start the server, enable DIL and message editing, and open the browser       |
| `/webui-stop`  | Stop the server and disable the Web UI DIL instructions                     |

Run `/webui` again to restart. The former `/webui-start` command and auto-start
configuration (`PI_WEB_UI_DISABLED` / `pi-web-ui.disabled`) are no longer used;
activation is always explicit. Enable Web UI while the agent is idle.

### Interactive clarification

Pi can end a turn with an interactive card that asks a question and previews the
options. Submit a choice from the card or reply in the chat input. Card
submissions appear in the conversation as your messages. Once Pi is idle, you
can submit again to revise your answer.

New, switched, and forked sessions and `/reload` require `/webui` again.
See [ADR 0013](adr/0013-explicit-webui-session-activation.md) for the activation
policy.

## Security & Remote Access

Pi Web UI binds to `127.0.0.1` by default — accessible only from your local machine.

- For remote or mobile access, use `tailscale serve` or a reverse proxy with TLS (see [MOBILE.md](https://github.com/kkkiio/pi-web-ui/blob/main/MOBILE.md)).
- There is no built-in HTTP Basic Auth; it is unnecessary for localhost access and insecure over cleartext.
