# language: zh-CN
功能: 左侧边栏 session 列表

  场景: 收起后保留图标列，展开显示 session 列表
    假如 当前工作区是 git 仓库
    而且 agent 会返回普通助手回复
    当 我打开 Pi Web UI
    那么 左侧边栏显示 agent session 列表

    当 我收起左侧边栏
    那么 左侧边栏只显示图标列
    而且 左侧边栏不显示 session 列表
    而且 聊天输入框仍然完整可见

    当 我展开左侧边栏
    那么 左侧边栏显示 agent session 列表