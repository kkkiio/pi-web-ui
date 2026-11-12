# language: zh-CN
功能: Header 与 Changes 面板

  场景: 默认单栏并从 Header 打开 Changes
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    那么 默认布局为单栏
    当 我让 agent 更新 workspace status 文档
    那么 Header 显示变更统计
    当 我打开 Changes
    那么 右侧详情面板显示 git diff tab
    当 我隐藏右侧详情面板
    而且 我恢复右侧详情面板
    那么 右侧详情面板只显示一个 Changes tab

  场景: 非 git 工作区
    假如 当前工作区不是 git 仓库
    当 我打开 Pi Web UI
    而且 我打开 Changes
    那么 面板显示非 git 状态

  场景: 移动端面板关闭后恢复主聊天
    假如 当前工作区是 git 仓库
    当 我打开 Pi Web UI
    而且 我切换到移动端
    而且 我打开 Changes
    那么 面板占满移动端宽度
    当 我隐藏右侧详情面板
    那么 聊天输入框仍然完整可见
