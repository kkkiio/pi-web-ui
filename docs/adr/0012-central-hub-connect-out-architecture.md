# ADR 0012: Central Hub Service with Connect-Out Extension

## Status

Accepted（取代 ADR 0006）。

本期收尾时的两项范围调整：

- **历史列表本期不交付**：hub 侧读取 `~/.pi/agent/sessions` 的实现（`src/hub/history.ts`、`list_history` 协议方法）已随实现落地，但**前端无入口，不作为本期验收项**。该功能等方案 C（从 Web 启动新 agent）落地时，作为"选择在哪启动"的界面一并实现——历史列表的用途是给用户挑一个已存在的 session 来续跑，而没有"启动新 agent"能力时它没有使用场景。
- **Conversation tree 彻底移除**：单 session 的会话树侧边栏（`conversation-sidebar-tree.tsx`、`conversation-tree-model.ts`、`use-conversation-tree.ts` 组件与 store 中的 tree 状态）随前端重写全部删除。Branch/Continue 的前端入口一并移除；`navigate_tree` 协议方法在 extension 侧保留，供未来功能复用，但本期前端不再调用。

## Context

ADR 0006 把 pi-web-ui 限定为单 session 镜像，并否决了在 extension 层做多 session 守护进程——理由是进程编排不属于 extension 层。这个判断仍然成立，但用户需求变了：

- 用户同时跑多个 Pi TUI agent（通常通过 herdr 管理多个终端面板），希望一个 Web UI 统一管理这些 session。
- 主场景：在现有 Pi TUI 里执行 `/webui:connect` 连上 Web 服务，出门后通过 Cloudflare Tunnel + Access 用手机访问。

当前架构的根本约束是**连接方向**：extension 在 Pi 进程内起 HTTP+WS server（:3001），浏览器连 extension。N 个 Pi 进程 = N 个端口，无法天然聚合，也没有多 session 的落点。

平台层确认的事实：

- Pi extension API 的事件（`agent_start`/`message_update`/`tool_execution_*`/`session_tree` 等）和命令能力（`pi.sendUserMessage`、`ctx.abort`、`ctx.compact`、`ctx.sessionManager` 等）对"extension 作为出站客户端"的模式覆盖完整，events forwarding（ADR 0002）和命令 handler 逻辑都不需要改。
- Extension 在 TUI 和 RPC 模式下都会加载（E2E harness 通过 `pi --mode rpc` 启动 Pi 并加载本扩展，经 `PI_WEB_UI_HUB` 自动连接 hub）。扩展命令可以通过 prompt 触发（`/mycommand`），所以 herdr 可以用 `herdr agent prompt` 向 TUI 里的 Pi 注入 `/webui:connect`。
- Session 文件在 `~/.pi/agent/sessions/` 按 cwd 组织，JSONL 格式公开（session-format.md）。

## Decision

采用 **独立 Hub 服务 + Extension 出站连接（connect-out）** 架构：

```text
pi TUI (herdr pane 1) ─┐
pi TUI (herdr pane 2) ─┤  WebSocket client   ┌──────────────┐      ┌──────────────┐
pi (E2E, rpc mode)   ──┘ ──────────────────▶ │ Hub 服务      │ ◀──▶ │ 浏览器        │
                                             │ 静态资源 + WS  │      │ 多 session UI │
                                             └──────────────┘      └──────────────┘
```

### Hub（新增独立服务，用户自己启动）

- serve 前端静态资源（`dist/` 从 extension 包移到 hub 包）。
- 提供两个 WS endpoint：`/ws/extension`（extension 连入）和 `/ws`（浏览器连入）。
- 维护 session 注册表，负责 browser 请求的 session 路由、事件扇出到所有 attach 的浏览器。
- 读 `~/.pi/agent/sessions/` **只用于列出 recent sessions/projects**（名称、时间、cwd、消息数等元信息）。**本期不交付该列表的 UI**（见 Status）；不在 hub 侧渲染完整 transcript——查看/继续历史 session 应通过 live agent（resume 后自然上线）。
- 绑定 `127.0.0.1`（沿用 ADR 0004）。**鉴权本期不做**；远程访问依赖隧道层自身的访问控制（如 Cloudflare Tunnel + Access）。

### Extension（瘦身）

- 删除 HTTP/WS server 和静态资源 serving，改为 WS **client** 连 hub。
- 新增 `/webui:connect [url]` 命令触发连接（若冒号与扩展命令后缀机制 `name:1` 冲突，则退为 `/webui-connect`）；支持 `PI_WEB_UI_HUB` 环境变量自动连接（E2E 和 herdr 注入场景用）。
- 断线指数退避重连；hub 不可达时 TUI 不受影响，仅 status/notify 提示。
- `/webui:connect` 时捕获 `ExtensionCommandContext` 作为 `latestExecuteCtx`——现有 `navigate_tree` 等高级功能的门控从 `/webui` 平移到 `/webui:connect`，语义不变。
- 事件转发保持薄传输（ADR 0002 不变）；文件/git/artifact 命令**留在 extension 侧执行**，因为它们依赖 Pi 进程的 cwd 和本地文件系统。

### 身份模型与 session 替换的连续性

两级身份：

- **agentId**：extension 进程启动时生成的 uuid，同一 Pi 进程内稳定，WS 重连不变。hub 的注册表以 agentId 为键。
- **sessionId**：由当前 session 文件派生。`/new`、fork、`switchSession` 后 session 文件变化，sessionId 随之变化。

session 替换（`session_start` 事件）后，extension 在同一条 WS 连接上推送身份更新（新 sessionId/name/file），hub **原地更新注册表项**：浏览器 attach 不断开、事件流连续、前端停留在原视图，只是 session 元信息变了。

被否决的语义是"旧 session 下线 + 新 session 上线"：每次 `/new` 都会在 session 列表里留下一条死记录，浏览器被踢回列表页，fork/tree 跳转这种高频操作会产生大量噪音条目。被 fork 丢下的旧 session 文件仍在磁盘上，通过 hub 的历史列表自然可见。

### 协议变更

- 沿用 ADR 0008 的 `req`/`res`/`event` 信封，增加 session 维度：browser → hub 的消息携带目标 agentId；hub → browser 的 event 携带来源 agentId/sessionId。
- 新增 hub 级方法：`attach`/`detach`/`list_sessions`（browser 侧）；extension 侧新增 hello + 身份更新消息。
- **多浏览器 attach 同一 session 不做额外互斥**：并发 prompt 直接依赖 Pi 自身的 steer/followUp 队列语义，与多终端 TUI 行为一致。

### RPC 模式的位置

主流程**不需要** RPC 模式，也**不依赖 herdr**——用户在终端（或 herdr 面板）里正常启动 Pi TUI，然后 `/webui:connect`。本期不做"从 Web 启动新 agent"，因此 hub 没有 herdr 集成代码。RPC 模式只保留给：

- E2E harness（沿用现有 `pi --mode rpc` 启动方式，extension 用 `PI_WEB_UI_HUB` 自动连接）；
- 未来的方案 C（见下）。

## Alternatives Considered

### 方案 B：Extension 仍是 server，hub 做注册表 + 反向代理

否决。每个 Pi 进程仍要占独立端口（需要端口分配策略）；远程场景网络方向错误（hub 要反向连到 extension 所在机器）；browser → hub → extension 的 WS 中转要维护双流。属于保守的阶段性方案，长期债大于短期省事。

### 方案 C：Hub 直接 spawn `pi --mode rpc`，无 extension

**延后，不排除。** 该模式失去 TUI 共存（RPC 无终端界面），`navigate_tree` 等依赖 `ExtensionCommandContext` 的功能不可用，不符合"终端干活 + Web 镜像"的主场景。但 pi-web-ui 的 WS 协议本就是 RPC 命令集的超集，hub 内部可以定义 `AgentTransport` 接口，未来增加 `RpcSubprocessTransport` 实现即可支持"从 Web 直接启动 headless agent"，与方案 A 共存。**历史列表（选择在哪启动）随本方案一起实现。** 本期不实现。

### 维持单 session（ADR 0006 现状）

被产品需求否决。

## Consequences

### Positive

- 单端口、无端口冲突；浏览器只有一个连接目标。
- Connect-out 天然支持 extension 与 hub 跨机器（远程 Pi 接本地 hub）。
- ADR 0006 的"进程编排不属于 extension 层"原则得到遵守——hub 是独立服务，extension 只做连接和转发。
- 静态资源归 hub 后 extension 包大幅瘦身；文件/git 命令的归属边界（数据在哪就在哪执行）更清晰。

### Negative

- 新增 hub 组件：session 注册表、路由、扇出、历史列表。
- Extension 要实现重连和断线降级。
- 前端是最大改动：全局单 session zustand store 要改为按 sessionId 命名空间 + URL 路由 + session 列表视图。
- ADR 0007 的 npm 发布策略需要修订（hub 包 + 瘦身 extension 包，或单包双入口）。

### Neutral

- ADR 0006 被本 ADR 取代（superseded）。
- ADR 0004 的绑定地址策略延续到 hub。
- E2E harness 增加 hub 进程；extension 经环境变量自动连接，整体更贴近真实使用路径。

## References

- [ADR 0002: Web UI Extension Event Protocol](./0002-web-ui-extension-event-protocol.md) — 薄传输原则延续
- [ADR 0004: Web UI Access Bind Address](./0004-web-ui-access-bind-address.md) — hub 沿用 localhost 绑定
- [ADR 0006: Single-Session Web UI](./0006-project-scope-single-session-web-ui.md) — 被本 ADR 取代
- [ADR 0008: Unified WebSocket Protocol](./0008-unified-websocket-protocol.md) — 信封格式延续并增加 session 维度
- [Pi extensions 文档](https://github.com/earendil-works/pi-coding-agent) — extension 事件/命令 API 与长生命周期资源约束
