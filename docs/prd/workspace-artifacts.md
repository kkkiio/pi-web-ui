# PRD: Workspace Artifacts

## Problem Statement

Pi Web UI 的聊天流会展示工具调用，但用户很难从聊天中快速找到“本轮工作实际产出的文档”。当 agent 使用 `edit` 或 `write` 修改 Markdown 文件时，这些文件往往就是计划、报告、规格说明或交付物。用户需要一个轻量入口查看这些文件，而不是在工具卡片和文件浏览器之间来回寻找。

## Solution

把当前 session 中由成功 `edit` / `write` 工具调用改动到的 Markdown 文件识别为 Workspace Artifacts。文件可以位于当前 workspace 内，也可以位于 workspace 外。Workspace Status Float 展示最近 artifacts；点击 artifact 会在 Right Panel 中打开 `artifact-file` tab，以只读方式查看文件内容。

## User Stories

1. 作为 Pi Web UI 用户，我希望浮窗自动列出 agent 修改过的 Markdown 文件，这样我能快速找到本轮产物。
2. 作为 Pi Web UI 用户，我希望点击 artifact 后在右侧 panel 查看文件内容，而不离开聊天。
3. 作为 Pi Web UI 用户，我希望同一个文件只出现一次，并按最近修改时间排序。
4. 作为 Pi Web UI 用户，我希望刷新页面后仍能从当前 session 历史恢复 artifact 列表。
5. 作为 Pi Web UI 用户，我希望删除或不可读文件显示明确错误，而不是空白 panel。

## Implementation Decisions

### Artifact 定义

Artifact 只包含 Markdown 文件：

- `.md`
- `.mdx`
- `.markdown`

只要当前 session 中成功的 `edit` 或 `write` 工具调用改动了这些文件，就将该文件视为 artifact。路径使用 normalized path 作为稳定 identity：workspace 内文件优先以 workspace-relative path 展示；workspace 外文件保留可读的绝对路径或路径尾部，避免不同目录下的同名文件互相覆盖。

### 数据来源

前端从两类数据构建 artifact 列表：

- Live tool events：实时记录成功的 `edit` / `write` 工具结果。
- Session entries：刷新或重连后，从历史工具调用恢复 artifact 列表。

前端负责解释工具输入/输出并维护 artifact state。Mirror Server 不把工具事件合成为 artifact 模型。

### 排序与去重

Artifacts 按 normalized path 去重。重复改动同一文件时更新 `updatedAt`、source tool 和 diff metadata，并把该文件移到列表前面。路径展示尽量使用 workspace-relative path；workspace 外文件展示可读的绝对路径或路径尾部。

### 展示信息

Workspace Status Float 中的 artifact row 展示：

- 文件名。
- 相对路径或父目录。
- 最近来源：`edit` 或 `write`。
- 最近更新时间或简短状态。

Right Panel 的 `artifact-file` tab 展示：

- 文件名和路径。
- 文件内容，使用 Markdown-friendly viewer。
- 读取失败、文件不存在或二进制/过大时的错误状态。

### 文件读取

点击 artifact 时，前端通过 WebSocket 方法请求文件内容。读取是只读操作，不触发 agent 工具调用，不修改 session。Mirror Server 读取文件前需要确认该路径属于当前 session 中成功 `edit` / `write` 产生的 Markdown artifact；workspace 内普通文件仍可由其他文件浏览入口读取，`artifact-file` tab 只负责 artifact 内容。

## Out of Scope

- 不把非 Markdown 文件纳入 Artifacts。
- 不在 Artifact tab 内编辑文件。
- 不追踪 artifact 语义类型，例如 plan、report、spec。
- 不把所有 tool output 都当成 artifact。
- 不要求 Mirror Server 持久化独立 artifact 数据库。

## Acceptance Criteria

1. 成功 `edit` / `write` 修改 Markdown 文件后，该文件出现在 Workspace Status Float 的 Artifacts 区域。
2. 同一路径多次修改只显示一个 artifact，并移动到列表前面。
3. 点击 artifact 打开 Right Panel 的 `artifact-file` tab。
4. 刷新页面后能从 session entries 恢复 artifact 列表。
5. 文件读取失败时，tab 显示可理解的错误状态。
6. Workspace 外 Markdown 文件如果由当前 session 的成功 `edit` / `write` 工具调用产生，也能作为 artifact 打开并读取。
