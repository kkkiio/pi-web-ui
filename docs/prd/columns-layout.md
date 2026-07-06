# PRD: Columns Layout

## Problem Statement

Pi Web UI 当前只有左侧导航栏和聊天区域两列布局。当用户在聊天中需要查看 git diff、Markdown artifacts、报告或预览等详细信息时，这些内容不得不挤在聊天流中，打乱阅读节奏。用户需要一个能够专注查看次要信息的区域，同时不丢失聊天上下文的实时更新。

## Solution

在经典的双列布局基础上，引入可选的右侧 tabbed panel，形成三列布局模式。Right Panel 打开时，悬浮状态卡片自动隐藏，二者互斥。用户可以在不离开聊天的情况下查看详细信息，并通过明显的 toggle 操作回到双列模式。

## User Stories

1. 作为 Pi Web UI 桌面用户，我希望聊天区域右侧有一个可开关的 tabbed panel，这样我可以在不中断聊天的情况下查看 git diff、artifact 文件或其他详细信息。

2. 作为 Pi Web UI 桌面用户，当我打开右侧详情侧边栏时，我希望悬浮状态卡片自动隐藏，以免两个右侧区域互相遮挡或重复。

3. 作为 Pi Web UI 桌面用户，我希望右侧 panel 有明确的 toggle button，隐藏后聊天区域恢复完整的宽度，以便我回到专注聊天的状态。

4. 作为 Pi Web UI 桌面用户，我希望在屏幕宽度受限时打开右侧 panel，左侧导航栏能自动折叠，这样聊天和详情区域仍保持可用。

5. 作为 Pi Web UI 移动端用户，我不希望看到多列并排布局，右侧 panel 内容应该以全屏或接近全屏的 sheet 形式打开，以便在小屏幕上有清晰的阅读体验。

6. 作为 Pi Web UI 移动端用户，我关闭 panel sheet 后，聊天滚动位置不应该丢失，这样我不用重新翻找刚才阅读的位置。

7. 作为 Pi Web UI 桌面用户，我希望 Right Panel 和聊天区域之间的边界可以拖拽调整宽度，以便我根据当前查看的内容灵活分配空间。

## Implementation Decisions

### 两列模式与三列模式互斥

Right Panel 与悬浮状态卡片互斥。打开 panel 时隐藏浮窗，隐藏或关闭 panel 后根据浮窗规则恢复显示。保持右侧区域只有一个活跃表面。

### 左侧导航折叠策略

在桌面三列模式下，当窗口宽度不足以容纳三列时，左侧导航栏自动折叠为图标或抽屉，优先保证聊天区域和 Right Panel 的可读性。导航折叠不应丢失用户的导航状态。

### Right Panel 的通用容器规则

Right Panel 提供通用的 tabbed 容器框架（tab bar、active tab、close tab、toggle button、可滚动内容体）。具体内容由各 feature 的 PRD 定义。初始支持的 tab 类型为 `git-diff` 和 `artifact-file`，规则见 `docs/prd/right-panel.md`。

### 详情内容专一性

Right Panel 不是通用的 context-item 渲染器。每个 feature 拥有自己的详情内容规则，不暴露原始事件 JSON 作为用户可见的详情视图。

### 移动端适配

移动端不尝试文字多列布局：左侧导航保持抽屉形式，Right Panel 内容以全屏 sheet 打开，浮窗不显示为大卡片。

## Out of Scope

- 不引入通用的 context-item 抽象层
- 不暴露原始事件 JSON 作为用户可见的详情视图
- 不替换现有的 session、model、settings 控件
- 不支持在 Right Panel 内直接编辑

## Further Notes

- Right Panel 宽度建议保持合理的可拖拽范围，最小宽度保证元数据可读，最大宽度保证聊天区域仍为主要工作区
- Right Panel 的 tab 生命周期、toggle 和移动端 sheet 行为由 `docs/prd/right-panel.md` 定义
