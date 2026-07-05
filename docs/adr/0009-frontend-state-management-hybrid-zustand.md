# ADR 0009: Frontend State Management — Hybrid Zustand + Local State

## Status

Proposed

## Context

`app.tsx` 目前超过 1300 行，持有 40+ 个 state/ref 变量，所有 WebSocket 事件处理集中在一个 200 行级别的 `handleEvent` switch 中。当前架构有三个明确问题：

1. **组件过大** — 单一文件承载 transport、事件路由、状态管理、UI 布局
2. **不可拆分** — 所有 handler 通过 `useCallback` 闭包捕获 setter，无法按 feature 独立
3. **不可扩展** — 新增 feature 必须修改 `handleEvent` switch 和状态声明

项目具有以下特征，直接影响架构选择：

- **单一 WebSocket 连接**推送高频 streaming 事件（`message_update` delta、`tool_execution_update` 等）
- **大部分状态来自同一条事件流**，权威源是 `state_sync` snapshot + 增量事件
- **6-8 个 UI feature**（chat、conversation tree、workspace status、right panel、model picker、settings、command palette、arch mode）共享 session state
- **小团队**，需要平缓的学习曲线和清晰的 ownership

## Decision

采用 **Hybrid Zustand + Local State** 模式，共享 session state 按 domain 切片组织。

核心原则：**集中处理事件，不集中存放一切状态。**

### 分层架构

```
WebSocket 事件流
       │
       ▼
  PiClient (transport)        ← send/重连/请求队列
       │
       ▼
  Event Dispatch              ← 事件 → action 路由
       │
       ▼
  Zustand Store (domain slices)
  ├── connectionSlice         ← WebSocket 状态
  ├── sessionSlice            ← state_sync snapshot, tree, leafId
  ├── streamSlice             ← streaming assistant message, tool calls
  ├── workspaceSlice          ← git status + artifacts
  ├── rightPanelSlice         ← tabs + active tab + visible state
  └── settingsSlice           ← model, thinkingLevel, theme, sessionName
       │
       ▼
  Feature UI Components
  ├── features/chat/          ← 读 store + 局部 UI state
  ├── features/conversation-tree/
  ├── features/settings/
  └── ...
```

### 什么进 Zustand，什么不进

**进 Zustand（跨 feature 共享的领域状态）：**

| Slice | 状态 | 说明 |
|-------|------|------|
| connection | `connectionState`, `error` | WebSocket 连接状态，多个组件需要展示 |
| session | `items`, `tree`, `leafId`, `lastUsage`, `chatStatus` | 来自 `state_sync` 的权威会话数据 |
| stream | `streamingId`, `streamingHasToolCall` | 流式增量更新状态 |
| workspace | `gitStatus`, `artifacts` | Workspace Status Float + Right Panel 都需要 |
| rightPanel | `tabs`, `activeTabId`, `visible` | Git diff 和 artifact-file tab 容器状态 |
| settings | `model`, `thinkingLevel`, `sessionName`, `themeMode` | header + settings panel 都需要 |

**不进 Zustand（组件局部 UI 状态）：**

- modal/panel 开关（modelOpen, settingsOpen, commandOpen, contextOpen）
- 输入框草稿（draftText）
- 搜索词（modelSearch）
- hover/highlight（highlightedEntryId）
- 选中态（selectedTreeEntryId）
- 加载态（loadingTreeEntryId, conversationSyncing）
- 队列（queuedMessages）

### Action 设计原则

**不暴露裸 setter**。Store 只暴露事件级 action：

```typescript
// ✅ 事件级 action — ownership 清楚
applyStateSync(payload: StateSyncPayload)
applyMessageStart(event: MessageStartEvent)
applyMessageDelta(event: MessageUpdateEvent)
applyToolExecutionEnd(event: ToolExecutionEndEvent)
applySessionTree(event: SessionTreeEvent)

// ❌ 裸 setter — 很快失控
setItems, setTree, setChatStatus, setLastUsage
```

### Feature 目录结构

```
src/web/src/
├── core/
│   ├── pi-client.ts          # WebSocket + RPC 请求/响应
│   ├── store/                # Zustand store
│   │   ├── index.ts          # 组合所有 slice
│   │   ├── connection-slice.ts
│   │   ├── session-slice.ts
│   │   ├── stream-slice.ts
│   │   ├── workspace-slice.ts
│   │   ├── right-panel-slice.ts
│   │   └── settings-slice.ts
│   └── types.ts              # 共享类型
│
├── features/
│   ├── chat/                 # 聊天消息面板
│   │   ├── chat-panel.tsx
│   │   ├── chat-input-container.tsx
│   │   └── chat-selectors.ts # 派生 selector
│   ├── conversation-tree/    # 对话树侧边栏
│   ├── workspace-status/     # Workspace Float + Artifacts
│   └── right-panel/          # Tabbed details panel
│
└── app.tsx                   # 布局组合 + 局部 UI state
```

## Consequences

### 正向

- **State ownership 清晰** — 每个 slice 只拥有一个 domain 的状态，写入只能通过 action
- **Feature 可独立开发** — 新增 To-Do List 只需新建 `features/todo/`，加载 `todoSlice`，不改现有代码
- **可测试** — Store 和 action 是纯逻辑，不依赖 React 组件，可直接单测
- **流式性能可控** — 高频 delta 事件只在 stream slice 内处理，Zustand selector 确保只有订阅该字段的组件重渲染
- **组件 mental model 简单** — 只读自己关心的，局部 UI 状态直接用 `useState`

### 负向

- **引入新依赖** — Zustand（~1KB gzipped），需要团队熟悉其 API
- **迁移成本** — 需要从 `useState` 分散状态迁移到 store slices，state_sync 的 applySync 逻辑需要重写
- **Slice 边界需要纪律** — 如果团队在没有 review 的情况下随意添加跨 slice 的写操作，会退化回 monolithic store

### 中性

- `app.tsx` 缩减到 ~200 行（只做布局组合 + 局部 UI state）
- 新增 feature 需要同时新增 slice（如果需要新领域状态）或仅新增 UI 组件（如果只用已有状态）

## Alternatives Considered

| 方案 | 判定 |
|------|------|
| Monolithic Zustand/Redux（单个大 store） | ❌ 容易导致状态膨胀和 ownership 模糊，正是我们要避免的 |
| Jotai / Atomic State | ❌ 单 WS 事件需要同时更新多个 atom，跨 atom 一致性和时序复杂 |
| 纯 EventBus Pub-Sub（模块级 singleton） | ❌ React StrictMode 双重挂载、HMR 幽灵监听、隐式依赖追踪困难 |
| Event Sourcing / CQRS | ❌ 实现复杂度高，6-8 个 feature 的项目不需要 replay/debug 能力，过度设计 |
| 纯组件 local state（不抽 store） | ❌ 高频 streaming 状态分布在多个组件中，`state_sync` 替换无法原子执行 |

## Migration Strategy（增量，不 big bang）

1. **引入 Zustand** — 安装依赖，创建空 store 骨架
2. **抽 PiClient** — 把 `send`、pending requests、WS connect/reconnect 从 App 移出
3. **建 store slices** — 按 domain 拆：connect → session → stream → workspace → rightPanel → settings
4. **迁事件处理** — 把 `handleEvent` switch 的每个 case 迁到对应 slice action
5. **迁 state_sync** — `applySync` 改造成 store action，原子替换 session state
6. **迁 UI** — 各 feature 组件改用 store selector 读状态，局部 UI state 留在组件内
7. **清理 App** — 删除已迁移的 state 声明和 handler，只保留布局组合

迁移期间 `state_sync` 只由一个 slice 处理，保证 snapshot 和增量事件之间的顺序一致性。

## References

- [Zustand — Bear necessities for state management](https://github.com/pmndrs/zustand)
- [Zustand slices pattern](https://docs.pmnd.rs/zustand/guides/slices-pattern)
- [TkDodo: State management for React apps in 2025](https://tkdodo.eu/blog/state-management-in-react-apps-in-2025)
- Codex (gpt-5.4) architecture evaluation, 2026-06-16
