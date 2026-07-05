# ADR 0010: Real Pi Agent Web UI E2E Tests

## Status

Accepted

## Context

Pi Web UI 的关键风险在端到端集成边界：浏览器 UI、WebSocket transport、mirror-server extension、Pi agent session、工具执行、文件系统、git workspace 和 session tree 必须一起工作。Workspace Status Float、Right Panel、artifact 展示、Branch/Continue、streaming tool card 等功能都跨过这些边界。

只接管 `/ws` 或直接设置 React state 可以构造稳定 UI 状态，但会绕过 Pi agent、extension runner、工具执行、session 写入和真实 git/file 状态。这类测试不能称为 E2E。

E2E 用例必须接近正式使用方式：启动真实 Pi CLI 进程，加载 Pi Web UI mirror-server extension，浏览器打开真实 Web UI，并通过 UI 触发 agent 行为。为避免真实 LLM 的速度、成本和不确定性，E2E 允许使用 faux LLM provider。Faux provider 只替换模型响应；Pi agent loop、工具调用、session 写入、extension 事件、mirror-server 和 frontend 都走真实路径。

## Decision

采用 **real Pi CLI + mirror-server extension + faux LLM provider + Playwright-BDD** 作为 Web UI E2E 测试方案。

测试目录放在项目根目录：

```text
e2e/
├── features/                 # Gherkin specs
├── steps/                    # playwright-bdd step definitions and page helpers
├── fixtures/                 # temp workspace setup and faux response fixtures
├── harness/                  # Pi process/session launcher
└── playwright.config.ts
```

Canonical CI path uses built frontend assets served by Pi mirror-server:

```text
Playwright Browser
  -> Pi mirror-server static UI + /ws
  -> Pi agent session started by pi --mode rpc
  -> faux LLM provider
  -> real tools / real temp workspace / real git
```

Vite dev server is not part of canonical E2E. It may be useful for local debugging, but CI E2E should build `dist` and set `PI_WEB_UI_STATIC_DIR` so mirror-server serves the same asset shape as production.

## E2E Definition

An E2E test must include:

- a real `pi` CLI process, started in `--mode rpc` for headless CI stability;
- the local Pi Web UI mirror-server extension loaded through normal extension loading;
- the Web UI opened in a real browser by Playwright;
- real WebSocket traffic between browser and mirror-server;
- real Pi tools and real temp workspace files;
- real git repository state when testing git behavior;
- faux LLM provider responses as the only model substitution.

The following are not E2E:

- tests that mock or replace `/ws`;
- tests that directly set React state, Zustand state, or component props;
- tests that run only the frontend without Pi;
- tests that assert only DOM selector existence.

## Playwright-BDD Usage

Playwright-BDD expresses product-level acceptance flows. Feature files should describe what the user does and observes, while selectors and process details stay in step definitions and harness helpers.

Example:

```gherkin
Feature: Workspace status

  Scenario: Open git diff and artifact from a real Pi agent run
    Given a temporary git workspace
    And the faux response fixture is "workspace-artifact"
    When I open Pi Web UI
    And I ask the agent to update the workspace status docs
    Then the workspace float shows the current branch
    And the workspace float shows git additions and deletions
    And the workspace float shows the Markdown artifact

    When I open the Markdown artifact
    Then the right panel shows the artifact file content

    When I hide the right panel
    And I open the Changes row
    Then the right panel shows the git diff tab
```

BDD assertions are functional assertions: text exists, controls are enabled, tabs open, file content loads, session state changes, and requests complete. E2E does not perform screenshot or pixel assertions. Visual quality belongs to ADR 0011.

## Harness Design

### Process Lifecycle

Run E2E serially at first:

```ts
// e2e/playwright.config.ts
workers: 1
```

One scenario uses:

```text
1 short-lived bddgen Node process
1 Playwright runner process
1 Playwright worker process
1 browser process tree
1 pi --mode rpc process with mirror-server extension
```

Each BDD scenario starts a fresh Pi process and a fresh temp workspace. The built `dist` directory is reused across scenarios.

### Pi Launch

The harness starts Pi with:

- cwd set to the temp workspace;
- `--mode rpc` for headless command/control;
- `--extension <repo>/extensions/mirror-server.ts`;
- `--extension <repo>/e2e/fixtures/faux-provider-extension.ts`;
- `--provider` / `--model` set to the faux provider/model;
- `PI_WEB_UI_STATIC_DIR=<repo>/dist`;
- `PI_WEB_UI_PORT=<free port>` for scenario isolation;
- isolated `PI_CODING_AGENT_DIR` and session directory under the scenario temp directory.

The harness waits until mirror-server responds on the selected `127.0.0.1:<port>` before Playwright opens the page.

### Advanced Features

Scenarios that need `latestExecuteCtx`, such as Branch, Continue, or tree navigation, must enable Web UI advanced features through the real `/webui` command path before exercising those controls. Workspace Status Float, git diff, artifacts, and Right Panel do not require `latestExecuteCtx`.

### Faux Response Fixtures

Faux response fixtures are static source modules under:

```text
e2e/fixtures/responses/
```

Each fixture defines the deterministic assistant response queue for the faux provider. If a scenario needs a Markdown artifact, the response must call the real Pi `write` or `edit` tool. The test then observes the artifact through Web UI state generated from real session/tool events.

Example:

```ts
export default [
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: "docs/prd/workspace-status-float.md",
        content: "# PRD: Workspace Status Float\n...",
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Updated the workspace status docs."),
];
```

The Playwright fixture selects the response fixture for the scenario, for example through an environment variable passed to the faux provider extension.

### Workspace Fixtures

Each scenario gets an isolated temp workspace:

1. create temp directory;
2. initialize git repository when needed;
3. write baseline files;
4. commit baseline when dirty/clean diff behavior matters;
5. start Pi with cwd set to that workspace;
6. clean up the Pi process and temp directory after the scenario.

Scenarios that need `No git repository` skip git initialization.

## Current Implementation

The first implemented scenario is `e2e/features/workspace-status.feature`.

It starts a real `pi --mode rpc` process, loads:

- `e2e/fixtures/faux-provider-extension.ts`;
- `extensions/mirror-server.ts`.

The faux provider fixture calls the real Pi `write` tool, modifying a committed Markdown file in a temporary git workspace. The browser then verifies that Workspace Status Float shows branch/diff/artifact state, that the artifact opens in an `artifact-file` Right Panel tab, and that the git diff opens in the singleton `git-diff` tab.

Run it locally with:

```bash
npm run e2e
```

## Priority Scenarios

### P0

1. **Chat lifecycle**: open Web UI, send prompt, faux provider returns text, assistant appears, input returns to ready state.
2. **Workspace Status + Right Panel**: faux response performs real `write` or `edit`, git diff changes, float shows branch/diff/artifact, clicks open `git-diff` and `artifact-file`.
3. **Conversation Tree**: create a branchable conversation, verify current leaf highlight, navigate tree, and Continue from a prior node.
4. **Connection recovery**: restart or reconnect mirror-server, then sync without duplicate chat rows.

### P1

- Model picker shows and selects faux model.
- Settings panel persistence.
- Context popover and compact action surface.
- Tool card success/error/long output expand behavior.
- Arch mode availability and enter/exit flow.

### P2

- Large session rendering.
- Long artifact paths and large Markdown file content.
- Dark mode functional coverage.
- Non-git workspace.
- Artifact read failure.

## CI Policy

GitHub Actions should run E2E on every PR. Local default checks do not run E2E unless the developer explicitly invokes the E2E command or is changing E2E harness/tests.

The canonical CI order is:

1. install dependencies;
2. build Web UI assets with `npm run build:web`;
3. run Playwright-BDD E2E against `pi --mode rpc` and built `dist`.

## Consequences

### Positive

- E2E tests cover the real Pi Web UI product path.
- Faux provider removes LLM cost and nondeterminism while preserving agent/tool/session behavior.
- Git diff and artifact behavior are validated against real workspace state.
- Playwright-BDD keeps acceptance flows readable and close to PRD language.

### Negative

- Slower than frontend-only integration tests.
- More moving parts: Pi CLI, mirror-server, faux provider, temp workspace, browser.
- Initial implementation runs serially to avoid port and workspace isolation complexity.
- Harness failures can come from process lifecycle, not only UI bugs.

### Neutral

- Visual validation remains separate and may use Browser screenshots without being E2E.
- Low-level frontend logic should still have unit/integration tests outside Playwright-BDD.

## Alternatives Considered

| Alternative | Assessment |
|-------------|------------|
| Mock `/ws` without Pi | Useful for visual validation or frontend integration debugging, but not E2E |
| Real Pi + real provider | Highest fidelity, but slow, costly, and nondeterministic for regular E2E |
| Interactive TUI mode | Closest terminal experience, but CI requires pseudo-terminal handling; `--mode rpc` keeps real Pi CLI/session with a stable headless host |
| Playwright without BDD | Viable, but less readable for PRD-level acceptance flows |
| Component tests with mocked props | Useful for narrow UI logic, insufficient for cross-boundary Web UI behavior |

## Migration Strategy

1. Done: add `e2e/` root directory with Playwright-BDD config.
2. Done: add faux provider extension and static faux response fixtures.
3. Done: add Pi E2E harness that starts `pi --mode rpc` with local mirror-server extension.
4. Done: add temp workspace helpers for git and file setup.
5. Done: add Workspace Status + Right Panel feature using a real `write` tool call.
6. Next: add Chat lifecycle as a smaller smoke scenario if it proves useful beside Workspace Status.
7. Next: add conversation tree and connection recovery scenarios.

## References

- `AGENTS.md`
- `docs/adr/0002-web-ui-extension-event-protocol.md`
- `docs/adr/0008-unified-websocket-protocol.md`
- `docs/adr/0011-web-ui-visual-validation.md`
- `docs/prd/workspace-status-float.md`
- `docs/prd/workspace-artifacts.md`
- `docs/prd/right-panel.md`
