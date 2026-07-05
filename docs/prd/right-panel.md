# PRD: Right Panel

## Problem Statement

Pi Web UI 需要一个稳定的右侧工作区来承载聊天之外的次要内容，例如当前 git diff、Markdown artifact 文件内容、未来的计划或报告。现有右侧详情侧边栏以单一详情视图为中心，无法表达 Codex 风格的多 tab 工作流，也缺少一个可预测的显隐控制。

## Solution

引入 Codex 风格的右侧 panel。Panel 顶部提供 tab bar、关闭 tab、打开/隐藏 panel 的 toggle button。Workspace Status Float 和其他入口只负责打开某个 tab；右侧 panel 负责 tab 生命周期、当前激活项、宽度、显隐和移动端呈现。

## User Stories

1. 作为 Pi Web UI 用户，我希望右侧 panel 可以同时保留多个已打开内容，这样我能在 git diff 和多个 artifact 文件之间切换。
2. 作为 Pi Web UI 用户，我希望点击浮窗中的 git diff 或 artifact 时复用已有 tab，而不是重复打开相同内容。
3. 作为 Pi Web UI 用户，我希望能通过 toggle button 隐藏或恢复右侧 panel，隐藏时不丢失已打开 tabs。
4. 作为 Pi Web UI 用户，我希望关闭一个 tab 时只移除该 tab，其他 tabs 和聊天上下文保持不变。
5. 作为移动端用户，我希望右侧 panel 以 sheet 形式打开，而不是挤压聊天区域。

## Implementation Decisions

### Panel 与 Tabs

Right Panel 是一个 tabbed container，不直接拥有业务数据解释。每个 tab 有稳定 identity：

```ts
type RightPanelTab =
  | { kind: "git-diff"; id: "git-diff"; title: "Changes" }
  | { kind: "artifact-file"; id: `artifact:${string}`; title: string; path: string };
```

`git-diff` 是 singleton tab。`artifact-file` 按 normalized workspace-relative path 去重。同一个入口再次打开时激活已有 tab，并刷新该 tab 数据。

### Toggle Button

Toggle button 只控制 right panel 显隐。隐藏 panel 不关闭 tabs，不清空 active tab，不影响 Workspace Status Float 的状态。再次打开时恢复上一次 active tab。

### 关闭行为

关闭 active tab 后激活相邻 tab。关闭最后一个 tab 后 panel 关闭。点击 panel 外部不关闭 tab；用户必须通过关闭按钮或 toggle 明确改变 panel 状态。

### 与 Workspace Status Float 的关系

桌面双列模式下 Workspace Status Float 可见。Right Panel 打开后进入三列表面，Workspace Status Float 隐藏。关闭或隐藏 Right Panel 后，Workspace Status Float 按自身规则恢复。

### 右侧内容类型

Right Panel v1 支持：

- `git-diff`：展示当前 git diff 详情。
- `artifact-file`：展示 Markdown artifact 文件内容。

每种内容类型拥有自己的 loading、empty、error 和 refresh 规则。Right Panel 不暴露原始 WebSocket payload 或 session entry JSON。

### 移动端适配

移动端不使用三列布局。Right Panel 以全屏或接近全屏 sheet 打开，tab bar 保留在 sheet 顶部。关闭 sheet 等同隐藏 panel，不清空 tabs。

## Out of Scope

- 不在 v1 添加新建 tab 的 `+` 操作。
- 不在 right panel 内编辑文件。
- 不在 right panel 内执行 commit、push 或 git 操作。
- 不把 right panel 设计成任意 JSON/context item 渲染器。

## Acceptance Criteria

1. Git diff 和 Markdown artifact 都以 right panel tab 打开。
2. 重复点击同一个 git diff 或 artifact 复用已有 tab。
3. Toggle button 隐藏 panel 后，再次打开仍恢复 tabs 和 active tab。
4. 关闭最后一个 tab 后 panel 关闭，Workspace Status Float 恢复。
5. 移动端以 sheet 呈现，不挤压聊天区域。
