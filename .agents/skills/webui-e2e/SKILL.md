---
name: webui-e2e
description: Real integration and visual validation workflow for Pi Web UI. Use when working on the Pi Web UI extension/frontend, WebSocket protocol, session tree sidebar, conversation navigation, fork/edit flows, local session replay, or any change where DOM-only checks can miss visible UI regressions.
---

# Pi Web UI Live Check

Use this skill to validate Pi Web UI against a real Pi extension process and real local session data. Treat static checks as necessary but insufficient.

## Rules

- Work from the repository root. Do not write resolved machine-specific absolute paths into docs, commits, PRs, screenshots, or handoff notes. Use `$PWD`, `$HOME`, `.tmp/...`, env vars, or relative paths.
- Prefer copied session files under `.tmp/` over opening original session JSONL files directly.
- Use the Browser in-app browser for visual verification after UI changes. For the session sidebar/tree, screenshot-first validation is required because smooth width transitions, alpha animations, overflow, and absolute positioning can make DOM/a11y checks ambiguous.
- Treat DOM checks as supporting evidence only. A tree row that exists in DOM is not enough; verify the sidebar is visibly open, rows are within the viewport, text is readable, and interaction states are visible.
- Do not leave transient servers running silently. Stop them before finishing, or explicitly report the URL and process/session that remains running for manual inspection.

## Real Setup

Run static checks first:

```bash
just check
npm run build:web
```

Start Pi with the extension loaded explicitly. Use `--no-extensions -e ./extensions/mirror-server.ts` to avoid duplicate package auto-loads during development:

```bash
mkdir -p .tmp/e2e
cp "$SESSION_FILE" .tmp/e2e/session-under-test.jsonl
PI_WEB_UI_STATIC_DIR="$PWD/dist" PI_WEB_UI_PORT="${PI_WEB_UI_PORT:-3001}" \
  pi --no-extensions -e ./extensions/mirror-server.ts --no-context-files --offline \
  --session .tmp/e2e/session-under-test.jsonl
```

In a second terminal, run the frontend dev server:

```bash
npm run dev:web
```

Open the in-app browser to:

```text
http://127.0.0.1:4444/
```

If validating the production bundle instead of Vite, open the Pi server port directly.

## Session Data

Use real local sessions when validating tree, tool cards, subagents, forks, or long histories. Pick a session with a mix of user, assistant, tool, and branch entries.

Keep discovery commands generic and avoid copying resolved private paths into reports:

```bash
SESSION_ROOT="${PI_CODING_AGENT_SESSION_DIR:-$HOME/.pi/agent/sessions}"
find "$SESSION_ROOT" -name '*.jsonl' -type f -print
```

Copy the chosen file to `.tmp/e2e/session-under-test.jsonl`, then run Pi against the copy.

## Protocol Checks

Verify the ADR 0008 request/response/event protocol against the real server. At minimum:

- `health` returns `{ type: "res", ok: true }`.
- `sync_request` returns a `res` whose `result` is the fresh state snapshot.
- `state_sync.payload` includes `entries`, `tree`, and `leafId`.
- `navigate_tree` returns `{ editorText?, cancelled? }` and updates `leafId`.

Use the project dependency rather than browser globals:

```bash
node - <<'NODE'
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:3001/ws");
ws.on("open", () => ws.send(JSON.stringify({ type: "req", id: "1", method: "sync_request" })));
ws.on("message", (data) => {
  const msg = JSON.parse(String(data));
  if (msg.type === "res") {
    console.log(JSON.stringify({ ok: msg.ok, hasTree: !!msg.result?.tree, leafId: msg.result?.leafId }));
    ws.close();
  }
});
NODE
```

## Visual Checks

Use the Browser skill and prefer screenshots for layout assertions. For the conversation tree/sidebar, verify:

- Sidebar is actually expanded on desktop; do not accept hidden rail DOM as success.
- Visible tree rows fit within the sidebar, with no large indentation caused by raw parent-chain depth.
- Branches are represented as a normal web tree interaction, using familiar disclosure/indentation states.
- Selected/current/active states are visibly distinct without terminal-style glyphs or stray dots.
- Clicking a node browses only: the main conversation scrolls to the corresponding item or nearest visible ancestor, highlights briefly, and the draft input remains unchanged.
- Fork exists under user messages in the conversation, not inside tree rows. Fork fills the input only after the explicit fork action.
- Search results match node content and are visible in the tree, not merely present in DOM.

Record both visual and state evidence in the final summary: screenshot-observed behavior, relevant DOM dimensions only when useful, and the WS state (`leafId`, entry count, selected entry id).

## Failure Pattern To Avoid

Do not conclude "sidebar works" from selectors like `[data-tree-entry-id]` alone. In this app, rows may exist while clipped, transparent, offscreen, or hidden behind the collapsed rail. Always confirm with a screenshot or visible bounding boxes inside the viewport.
