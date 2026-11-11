# PRD: Columns Layout

## Problem Statement

Pi Web UI 是单会话（Single-Session）的 **Interactive Agent UI**。过去的布局包含左侧导航栏（Left Sidebar / Tree Sidebar）、中间聊天区、右上角悬浮状态窗（Workspace Status Float）以及右侧面板（Right Panel）：
1. 单会话场景下不需要切换多项目/多会话，砍掉 Branch 树后，Left Sidebar 只剩一个设置按钮，占用水平空间且造成三栏拥挤。
2. 右上角悬浮的 Workspace Status Float 经常遮挡聊天消息（Transcript），干扰阅读。
3. 当用户需要对照查看 Git Diff（核对模型到底改了哪些代码）或开启旁路追问（Side Chat / BTW）时，需要一个按需展开、不遮挡主对话流的右侧面板。

## Solution

采用 **「默认单栏居中 + 按需双栏展开（Main Chat + Right Panel）」** 的极简布局：
- **移除 Left Sidebar** 与 **Workspace Status Float**。
- **统一顶部 Header Bar**：承载品牌与连接状态、当前会话标题、模型与思维级别控制、上下文用量、Git 变更摘要按钮（如 `+42 -15`，点击打开 Git Diff 面板）、Right Panel 显隐按钮以及 Settings 入口。
- **主对话区（Main Chat）**：默认单栏居中显示，视野开阔且无任何悬浮遮挡。
- **右侧面板（Right Panel）**：按需从右侧展开，与 Main Chat 构成可拖拽调整宽度的左右双栏布局。

## Layout Overview

### 默认单栏模式（Right Panel 隐藏）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [Pi] Session Title   [Model] [Thinking] [Context]  [+42 -15] [⚙] [◨]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         Main Chat Transcript                         │
│                    （居中单栏，无悬浮窗遮挡内容）                       │
│                                                                      │
│                       [ Prompt Composer ... ]                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 双栏模式（Right Panel 展开：Git Diff / Side Chat）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [Pi] Session Title   [Model] [Thinking] [Context]  [+42 -15] [⚙] [◨]│
├──────────────────────────────────────┬───────────────────────────────┤
│                                      │ [Changes] [BTW: Side Chat] [×]│
│         Main Chat Transcript         ├───────────────────────────────┤
│                                      │                               │
│                                      │   Git Diff / Side Chat 视图    │
│                                      │  （支持对 Diff 行直接 Comment） │
│       [ Prompt Composer ... ]        │                               │
└──────────────────────────────────────┴───────────────────────────────┘
```

## User Stories

1. 作为 Pi Web UI 用户，我希望默认界面是干净的单栏聊天视图，没有任何左侧栏或悬浮窗遮挡对话内容。
2. 作为 Pi Web UI 用户，我希望在顶部 Header 直接看到当前 Git 变更统计（如分支名与 `+N -N`），点击即可在右侧打开 Git Diff 面板，无需悬浮卡片。
3. 作为 Pi Web UI 用户，我希望在顶部 Header 直接访问 Settings，无需展开左侧抽屉。
4. 作为桌面端用户，当我打开 Right Panel（查看 Git Diff 或进行 Side Chat）时，我希望能够拖拽中间分隔线调整左右两栏宽度。
5. 作为移动端用户，我不希望小屏幕并排显示两列，Right Panel 应以全屏或接近全屏的 Sheet 形式打开，且关闭后保持主聊天滚动位置不变。

## Implementation Decisions

### 1. 移除左侧栏与悬浮窗
- 不再渲染 Left Sidebar（会话树/历史列表）和 Workspace Status Float。
- Settings 按钮、连接状态指示器、Git 状态摘要入口统一收敛到顶部 Header。

### 2. 单栏与双栏切换
- Right Panel 关闭或隐藏时，Main Chat 占据全部可用宽度（内部消息容器保持舒适的最大阅读宽度并居中）。
- Right Panel 展开时，与 Main Chat 并排形成左右双栏，中间提供可拖拽 resize handle。

### 3. 移动端适配
- 移动端始终保持单栏主视图，Header 按钮紧凑排列；打开 Right Panel 时以 Sheet 呈现。

## Out of Scope

- 不包含三栏布局（无 Left Sidebar）
- 不包含悬浮在聊天内容上方的 Workspace Status Float
- 不包含多会话切换列表或会话分支树侧边栏

## Further Notes

- Right Panel 内部的 Tab 生命周期、Git Diff 渲染与行级 Comment 交互见 `docs/prd/right-panel.md`。
