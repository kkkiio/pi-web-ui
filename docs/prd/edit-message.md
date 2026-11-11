# PRD: Edit Message

## Problem Statement

在与 Coding Agent 协作时，用户经常在发送消息后立即发现错别字、表述不清或遗漏了关键约束；或者看到模型第一轮走偏后，希望直接修改上一条 prompt 重新发送，而不是在已经走偏的上下文后面继续打补丁。

## Solution

在 Pi Web UI 的用户消息上提供行内 **Edit Message（编辑消息）** 功能。用户点击铅笔图标后，消息在原地变为可编辑文本框；修改后点击 **Save & Send**（或按 `Enter`），自动通过 `navigate_tree` 回退到该消息之前的位置并重新发送修改后的 prompt。

## User Stories

1. 作为 Pi Web UI 用户，我希望在聊天界面点击任何一条我发送过的消息旁的编辑按钮（`Edit`），快速修改手快写错的错别字或补充约束。
2. 作为 Pi Web UI 用户，我希望点击编辑后消息文本在**原地变成可编辑的文本框**（提供 `Cancel` 和 `Save & Send`），而不是把文字塞回页面底部的主输入框，这样上下文位置直观且不会覆盖底部草稿。
3. 作为 Pi Web UI 用户，我希望提交编辑后从该消息原本的位置重新发起对话，截断当前视图中该消息之后的旧回复并开始新的流式生成。
4. 作为 Pi Web UI 用户，我希望每条用户消息上始终显示编辑按钮；当未通过 `/webui` 捕获命令上下文导致功能不可用时，按钮置灰并 hover 提示原因（`"Run /webui in terminal to enable editing"`）。
5. 作为 Pi Web UI 用户，当 agent 正在生成回复（streaming）时，编辑按钮应禁用，避免在流式输出中途产生竞态。

## Implementation Decisions

### 行内编辑交互（Inline Edit）

- 点击用户消息操作栏的铅笔图标（`PencilIcon`）进入行内编辑态。
- 原消息气泡替换为自适应高度的 `textarea`，初始值为原消息文本，自动聚焦并将光标置于末尾。
- 快捷键：
  - `Enter`（不含 `Shift`）：触发 `Save & Send`
  - `Shift+Enter`：换行
  - `Escape`：取消编辑，恢复原消息展示
- 操作按钮：`Cancel`（次要按钮）与 `Save & Send`（主按钮，提交中显示 `Saving...`）。

### 两步协议

编辑提交使用两步 WebSocket 协议：

1. `navigate_tree` — 将 session 定位到目标用户消息之前的位置（`entryId`）。
2. `prompt` — 导航成功确认后，立即发送编辑后的新文本。

若第 1 步导航失败，则在行内展示错误提示，不发送 `prompt`。

### `navigateTree` 获取方式

`navigateTree` 仅在 Pi 的 `ExtensionCommandContext` 中可用。Pi Web UI 在 `/webui` 命令 handler 中捕获 `latestExecuteCtx` 供 WebSocket handler 使用。详见 `docs/adr/0003-navigate-tree-via-captured-command-context.md`。

### UI 状态同步

导航完成后，前端刷新当前会话分支条目（`getBranch()`），清除该消息之后的旧分支残留条目，随后通过正常的流式事件增量追加新回复。

## Out of Scope

- 不支持编辑 assistant、tool 或 system 消息
- 不暴露独立的 Session Tree Sidebar 或 Branch/Continue 按钮（保持单会话主界面极简）
- 导航前后不弹窗二次确认

## Acceptance Criteria

1. 用户消息 hover 操作栏显示 Copy 和 Edit（铅笔图标）按钮。
2. 点击 Edit 后在消息原地展开 `textarea` 及 `Cancel` / `Save & Send` 按钮，不影响底部主输入框草稿。
3. 修改文本并点击 `Save & Send`（或按 `Enter`）后，回退到该消息位置并发送新消息，后续旧消息从当前对话流移除。
4. 未执行 `/webui` 时，Edit 按钮置灰且 tooltip 提示 `"Run /webui in terminal to enable editing"`。
