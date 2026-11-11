# Configuration

Pi Web UI runs inside your Pi process and starts automatically on `http://127.0.0.1:3001` when a session begins.

## Environment Variables

Set before starting `pi`:

| Variable                      | Default       | Description                           |
| ----------------------------- | ------------- | ------------------------------------- |
| `PI_WEB_UI_PORT`              | `3001`        | HTTP & WebSocket server port          |
| `PI_WEB_UI_HOST`              | `127.0.0.1`   | Server bind address                   |
| `PI_WEB_UI_DISABLED`          | `0`           | Set to `1` to disable auto-start      |
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
| `/webui`       | Capture command execution context (enables `Edit Message`) and open browser |
| `/webui-stop`  | Stop the HTTP + WebSocket server                                            |
| `/webui-start` | Start the server again                                                      |

To start Pi without auto-starting the Web UI server:

```bash
PI_WEB_UI_DISABLED=1 pi
```

## Security & Remote Access

Pi Web UI binds to `127.0.0.1` by default — accessible only from your local machine.

- For remote or mobile access, use `tailscale serve` or a reverse proxy with TLS (see [MOBILE.md](../MOBILE.md)).
- There is no built-in HTTP Basic Auth; it is unnecessary for localhost access and insecure over cleartext.
