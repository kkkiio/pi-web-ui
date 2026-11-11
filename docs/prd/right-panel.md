# PRD: Right Panel & Git Diff Comment

## Problem Statement

在针对偏科 Coding、长任务模型（如 GPT coding 变体、DeepSeek）的 **Interactive Agent UI** 中，模型经常出现两类问题：
1. **隐式发散与留坑**：嘴上汇报“已按要求小幅修改”，实际在代码多处做了超出预期的改动。自然语言汇报不可全信，用户必须看 **Git Diff** 才能掌握代码真相（Ground Truth），并且需要在看到不合理改动时，直接指着具体代码行让模型改回去。
2. **表达晦涩难懂**：模型输出黑话或跳跃性结论时，用户需要旁路追问（`BTW / Ask in Side Chat`），而不打断主线上下文。

因此，Pi Web UI 需要一个专注服务于 **代码核查与交互纠偏** 的右侧面板（Right Panel），砍掉鸡肋的静态 Markdown Artifacts 预览，强化 Git Diff 的交互式 **Comment（引用代码变更到对话）** 能力，并为未来的 **Side Chat (BTW)** 预留容器。

## Solution

提供按需展开的右侧 Tabbed Panel：
- **Git Status Header 入口**：顶部 Header 显示紧凑的 Git 分支与变更统计（如 `main +42 -15`），取代原来会遮挡聊天内容的 Workspace Status Float。点击该入口打开或聚焦 Right Panel 的 `Changes (git-diff)` tab。
- **Git Diff 视图 + 行级 Comment（Codex 风格）**：
  - 使用 `@git-diff-view/react` 按文件展示当前工作区的 staged / unstaged / untracked 文本变更。
  - 支持在 Diff 视图中针对具体文件/代码行点击 **Comment**（或选中行添加评论），将该处代码变更的位置（文件路径、行号范围、diff 片段）及用户的批注直接附加/发送到主对话输入框（与 `Quote / Add to Chat` 机制贯通），精准指导 Agent 修正代码。
- **预留 Side Chat (BTW) 容器**：后续支持从主对话选中晦涩内容并在 Right Panel 打开独立的 `Side Chat` tab。

## User Stories

1. 作为 Pi Web UI 用户，我希望在顶部栏一眼看到当前 Git 分支和 `+N -N` 变更量，点击即可在右侧查看完整 Diff，且不会有任何悬浮窗挡住聊天文字。
2. 作为 Pi Web UI 用户，当我在右侧 Git Diff 中发现模型乱改了某几行代码或留了坑时，我希望能像 Codex App 一样点击代码行旁的 **Comment** 按钮，写下批注或将该段 Diff 引用到聊天框中，精准要求模型修正。
3. 作为 Pi Web UI 用户，我希望能通过顶部 toggle 按钮随时隐藏或恢复右侧面板，隐藏时不丢失当前查看位置。
4. 作为移动端用户，我希望右侧面板以全屏 Sheet 打开，避免挤压主对话区域。

## Implementation Decisions

### 1. Panel 与 Tabs 模型

Right Panel 是一个轻量的 tabbed container：

```ts
type RightPanelTab =
  | { kind: "git-diff"; id: "git-diff"; title: "Changes" }
  | { kind: "side-chat"; id: `side-chat:${string}`; title: string }; // Planned for BTW / Ask in Side Chat
```

- 移除 `artifact-file` tab 及相关的 Markdown artifact 追踪逻辑。
- `git-diff` 为 singleton tab，重复点击顶部 Git 状态入口时聚焦已有 tab 并刷新 diff 数据。

### 2. Git Status 刷新机制

前端主动向 extension 请求 Git 状态（`get_git_status` / `get_git_diff`），不在 `state_sync` 中耦合。
防抖刷新时机：
- WebSocket 连接/重连成功
- Session 同步完成
- 工具执行结束（`tool_execution_end`）
- 轮次结束（`turn_end`）

### 3. Git Diff 行级 Comment（Interactive Code Steering）

- 在 Diff 行 hover 或选中行范围时，显示 **Comment** 按钮。
- 用户可以：
  - **Add to Chat / Quote Diff**：将选中的文件路径、行号与 diff 片段作为结构化引用卡片插入主输入框（Composer），允许用户凑齐多处问题一次性发送给 Agent。
  - **Quick Comment**：在行内弹出轻量输入框写下针对该行的修改意见，确认后合入主输入框引用列表（或直接发送）。

### 4. 显隐与移动端行为

- Toggle 按钮控制 Right Panel 显隐；隐藏时保留已打开的 tab 状态。
- 移动端使用 Sheet 呈现 Right Panel，不展示并排双栏。

## Out of Scope

- 不包含 Workspace Status Float 悬浮卡片
- 不包含 Markdown Artifacts (`artifact-file`) 识别与查看
- 不在 Right Panel 内直接手动编辑源码文件或执行 git commit/push

## Acceptance Criteria

1. 界面中不再出现遮挡聊天记录的 Workspace Status Float；Git 状态摘要位于顶部 Header，点击可打开/聚焦右侧 `Changes` tab。
2. Right Panel 正确渲染工作区 Git Diff（文件列表、additions/deletions 统计、语法高亮 diff hunk）。
3. 支持在 Git Diff 代码行上触发 **Comment**，将目标文件路径、行号范围及批注/引用汇入主聊天输入流。
4. 隐藏与恢复 Right Panel 时状态保持稳定；移动端以 Sheet 打开。
