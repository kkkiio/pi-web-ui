# PRD: Branch Message

## Problem Statement

Pi 的 `/tree` 支持在同一个 session 文件里回到某个历史节点并继续对话，从而形成新的分支。Pi Web UI 需要把这个能力暴露到浏览器，但不能把它命名为 Fork：Pi 官方 `/fork` 会创建新的 session 文件，和这里的同 session 分支语义不同。

## Solution

在 user message 上提供 **Branch** 操作。用户点击 Branch 后，Pi 将当前会话位置移动到该 user message 之前，并返回原消息文本。Web UI 将文本填入主输入框，用户修改并发送后，在当前 session tree 中生成一个新分支。

Tree sidebar 也可以在 user node 上显示 Branch 按钮，作为非当前分支的入口。普通 Tree row 点击只做本地 select/locate/highlight，不切换会话位置，不改变 conversation 内容，也不覆盖 draft。

## User Stories

1. 作为 Pi Web UI 用户，我希望从任意 user message 创建同 session 分支，这样可以保留旧路径并尝试另一种输入。
2. 作为 Pi Web UI 用户，我希望 Tree 里的普通点击只帮我定位和理解结构，不会意外切换主 conversation 或覆盖正在写的 draft。
3. 作为 Pi Web UI 用户，我希望非当前分支上的 user node 也能直接 Branch，因为它不会出现在当前 conversation 的快捷按钮里。
4. 作为 Pi Web UI 用户，我希望功能名称和 Pi 官方命令一致：Branch 表示同 session tree 分支，Fork 保留给未来创建新 session 文件的功能。

## Implementation Decisions

### UI Entry Points

- Conversation user message action row 显示 Branch 按钮。
- Tree sidebar 的 user node 显示 Branch 按钮。
- Tree row body click 只做本地 select/locate/highlight。
- Branch 操作会在 draft 非空时确认是否覆盖。

### 操作流程

1. 用户点击 Branch，若 draft 非空则确认是否覆盖。
2. 系统定位到目标 user message 前，将原消息文本填入输入框。
3. 用户修改文本后发送，在当前 session tree 中生成新分支。
4. Branch 成功后自动刷新当前 branch 内容和完整 tree 结构。

### Naming

用户可见文案使用 Branch：

- Button label: `Branch from message`
- Tooltip: `Branch from message`
- Status text: `Branching from ...`
- Error: `Branch failed`

功能命名与 Pi 命令保持一致：Branch 对应同 session tree 分支，Fork 保留给未来创建新 session 文件的功能。

## Out of Scope

- 不创建新的 session 文件；真正的 Fork 应该使用 Pi 的 Fork 功能单独实现
- 不支持 Branch assistant/tool/system node
- 不做 inline edit；Branch 文本填入主输入框
- 不提供分支预览或分支合并

## Acceptance Criteria

1. Conversation user message 和 Tree user node 都有 Branch 入口。
2. Branch 成功后输入框填入原 user message 文本并获得焦点。
3. 普通 Tree row click 不改变 `leafId`、不刷新 conversation、不会覆盖 draft。
4. 发送 Branch draft 后，Tree 更新并展示新的 sibling branch。
5. UI 和文档不再用 Fork 描述当前 `navigate_tree` 功能。
