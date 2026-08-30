set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

fmt:
    npm run check:write

check:
    npx tsc --noEmit
    npx tsc --noEmit -p tsconfig.hub.json
    npx tsc --noEmit -p tsconfig.extension.json
    npm run check

build:
    npm run build:web
    npm run build:hub

# Build the hub, then run it in the foreground (Ctrl-C to stop).
# Extra args pass through to the hub CLI, e.g. `just run-hub --port=8080`.
run-hub *ARGS:
    npm run build:hub
    node dist-hub/hub/cli.js {{ARGS}}

# Dev mode: hub + Vite dev server (:4444, HMR, proxies /ws to the hub) side by
# side via `concurrently`. Open http://localhost:4444. Ctrl-C stops both.
# The hub port follows PI_WEB_UI_HUB_PORT (default 3001); vite.config.ts reads
# the same env var for its proxy target, so the two never drift apart.
dev-hub:
    npm run dev

# Start a fixed visual scenario environment (hub + real pi with faux provider)
# for agent-driven or manual visual checks. Prints a URL; Ctrl-C stops and
# cleans up. Example: `just visual git-messy`. See e2e/visual/serve.mjs for the
# scenario list.
visual NAME:
    npm run build:web
    npm run build:hub
    node e2e/visual/serve.mjs {{NAME}}