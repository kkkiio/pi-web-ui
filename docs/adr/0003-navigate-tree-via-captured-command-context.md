# ADR 0003: Session Control via Captured Command Context

## Status

Accepted

## Context

Pi 有两种上下文类型：

| 类型 | 可用方法 | 谁拿到 |
|------|---------|--------|
| `ExtensionContext` | `ui`, `sessionManager`(read), `model`, `cwd`, `isIdle()`, `abort()`, `shutdown()`, `compact()` | 事件回调 (`pi.on(...)`) |
| `ExtensionCommandContext` | 上述所有 **+** `navigateTree()`, `newSession()`, `fork()`, `switchSession()`, `waitForIdle()`, `reload()` | 命令 handler (`pi.registerCommand(...)`) |

Pi Web UI 的核心事件处理（WebSocket handler）运行在 `ExtensionContext` 中，因此**无法调用 `navigateTree` 等 session 控制方法**。

Pi 作者明确拒绝将 session 控制方法暴露给 `ExtensionContext`（GitHub #3673）。`pi.sendUserMessage("/cmd")` 也不会触发已注册的命令（GitHub #4754，by design）。

## Decision

在 `/webui` 命令 handler（唯一能拿到 `ExtensionCommandContext` 的地方）中**捕获完整的 `ExtensionCommandContext`**，存储为模块级变量 `latestExecuteCtx`。

```
用户运行 /webui
  → ExtensionCommandContext 创建
    → latestExecuteCtx = ctx
    → WebSocket handler 可通过 latestExecuteCtx.navigateTree() 调用 session 控制方法
```

**不使用** `latestNavigateTree` 函数指针——那样每次需要新方法时都得新增捕获。捕获完整上下文，未来任何 `ExtensionCommandContext` 上的方法都自动可用。

### 两个模块级 context 变量

| 变量 | 类型 | 用途 | 更新时机 | 清空时机 |
|------|------|------|---------|---------|
| `latestCtx` | `ExtensionContext \| null` | 事件驱动：读状态、转发事件、ui 通知 | 每个 `pi.on(...)` 回调 | `session_shutdown` |
| `latestExecuteCtx` | `ExtensionCommandContext \| null` | 命令驱动：`navigateTree` 等 session 控制 | `/webui` handler | `session_start`, `session_shutdown` |

还有一个辅助标志：

| 变量 | 类型 | 用途 |
|------|------|------|
| `advancedFeaturesEnabled` | `boolean` | 用户是否执行过 `/webui`。仅用于向浏览器发送 `webui_state` 事件控制 UI |

## Consequences

### 正向

- 不修改 Pi 源码
- 复用现有 `/webui` 命令，不注册额外斜杠命令
- 捕获完整上下文，未来扩展 session 控制操作无需新增变量
- 命名清晰：`latestCtx`（事件）vs `latestExecuteCtx`（命令）

### 负向

- `/webui` 必须执行过一次，`latestExecuteCtx` 才可用。session 替换后需重新执行
- 捕获的上下文在 runner dispose 后变 stale。`session_start` 清空可防止误用
- 是 workaround，如果 Pi 原生支持应迁移

### 中性

- 前端通过 `webui_state` 事件的 `advancedFeatures` 字段得知 Edit 功能是否可用
- `/webui` 文案从 "Open browser" 扩展为 "Connect web UI for advanced features"

## Alternatives Considered

| 方案 | 判定 |
|------|------|
| 类型强转 `ctx` 为 `ExtensionCommandContext` | ❌ 运行时对象上不存在这些方法 |
| 修改 Pi 源码给 `ExtensionContext` 加 session 控制方法 | ❌ Pi 作者明确拒绝 |
| 直接操作 `sessionManager.branch()` | ❌ 仅移动 leaf 指针，不更新 agent state |
| 仅捕获 `navigateTree` 函数指针 | ❌ 每次需要新的 command-only 方法都要新增捕获，维护成本高 |

## References

- Pi Extension API: `ExtensionContext` vs `ExtensionCommandContext` (`extensions/types.ts`)
- GitHub #3673: session control methods restricted to command context — rejected by author
- GitHub #4754: `pi.sendUserMessage("/cmd")` does not execute slash commands — by design
- Pi Extension Runner: `createCommandContext()` at runner.ts
