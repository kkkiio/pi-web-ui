# PRD: Workspace Status Float

## Problem Statement

在 Pi Web UI 双列模式下，聊天区域右上角有空间可以承载当前 workspace 的轻量状态。用户需要快速看到当前 git branch、当前 diff 规模，以及本轮 agent 产出的 Markdown artifacts。现在这些信息分散在聊天工具卡片、文件系统和终端状态中，用户需要额外操作才能确认当前 workspace 发生了什么。

## Solution

在聊天区域右上角增加 Codex 风格的 Workspace Status Float。浮窗展示 git 状态和 Markdown Artifacts 摘要；点击 git diff 或 artifact 会打开 Right Panel 对应 tab。浮窗是入口和摘要，不负责展示完整 diff 或完整文件内容。

## User Stories

1. 作为 Pi Web UI 桌面用户，我希望在聊天区域右上角看到当前 git branch，这样我能确认当前工作分支。
2. 作为 Pi Web UI 桌面用户，我希望看到当前 git diff 统计，例如 `+251 -414`，这样我能快速判断变更规模。
3. 作为 Pi Web UI 用户，我希望点击 git diff 状态后在右侧 panel 查看完整 diff。
4. 作为 Pi Web UI 用户，我希望看到 agent 修改过的 Markdown artifacts，并能点击查看文件内容。
5. 作为 Pi Web UI 用户，即使当前没有变更或 artifact，浮窗也应显示紧凑空状态，而不是完全消失。
6. 作为移动端用户，我不希望大浮窗覆盖聊天内容，而是通过紧凑入口打开同样的状态内容。

## Implementation Decisions

### 显示内容

Workspace Status Float 包含两个区域：

- Git：当前 branch、diff 统计、非 git repo 或无变更状态。
- Artifacts：最近由 `edit` / `write` 工具改动过的 Markdown 文件。

不显示 workspace 名称、路径来源或 `Local` 行。

### Git 状态

前端主动查询 git 状态。Git 状态不放入 `state_sync` / `get_state`。前端在 WebSocket 连接、重连、session sync、工具结束和 turn 结束后 debounce 请求最新状态。

Git 区域展示：

- 当前 branch，例如 `main`。
- 有变更时显示 additions/deletions，例如 `+251 -414`。
- 没有变更时显示 `No changes`。
- 不在 git repo 时显示 `No git repository`。

点击 diff 统计或 `No changes` 行打开 Right Panel 的 `git-diff` tab。无 git repo 时该行不可打开。

### Artifacts 摘要

Artifacts 区域展示最近 Markdown artifacts，来源规则见 `docs/prd/workspace-artifacts.md`。每行点击后打开 Right Panel 的 `artifact-file` tab。重复点击同一 artifact 激活已有 tab。

### 与 Right Panel 的关系

Workspace Status Float 只负责打开 tab：

- Git diff 行打开 `git-diff` tab。
- Artifact 行打开 `artifact-file` tab。

Right Panel 打开时，浮窗隐藏。Right Panel 隐藏或关闭后，浮窗恢复。

### 移动端适配

移动端不显示大型浮窗。移动端使用紧凑触发按钮或 sheet 入口，内容结构保持与桌面浮窗一致。

## Out of Scope

- 不展示完整 git diff。
- 不在浮窗内展示完整 artifact 内容。
- 不执行 commit、push、checkout 或其他 git 操作。
- 不在浮窗内编辑文件。
- 不展示外部 agent 状态。
- 不将浮窗设计成通用 context item 渲染器。

## Acceptance Criteria

1. 桌面双列模式下浮窗默认可见。
2. 浮窗展示当前 branch 和 diff additions/deletions。
3. 无变更时显示 `No changes`，非 git repo 时显示 `No git repository`。
4. 点击 git diff 打开 Right Panel 的 `git-diff` tab。
5. `edit` / `write` 修改 Markdown 文件后，Artifacts 区域出现对应文件。
6. 点击 Artifact 打开 Right Panel 的 `artifact-file` tab。
7. Right Panel 打开时浮窗隐藏；Right Panel 关闭后浮窗恢复。
