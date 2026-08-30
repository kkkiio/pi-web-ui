# language: zh-CN
功能: 多 agent 会话

  场景: 多个 agent 连接时可以在 session 列表间切换
    假如 当前工作区是 git 仓库
    而且 agent 会返回普通助手回复
    当 我打开 Pi Web UI
    而且 第二个 agent 连接到 hub
    那么 左侧边栏显示 2 个 agent 会话

    当 我发送消息 "你好"
    那么 聊天区显示消息 "你好，Pi Web UI 已收到消息。"

    当 我切换到 agent "Agent Beta"
    那么 当前会话显示为空
    而且 聊天区不显示消息 "你好，Pi Web UI 已收到消息。"

    当 我切换到 agent "Agent Alpha"
    那么 聊天区显示消息 "你好，Pi Web UI 已收到消息。"
    而且 当前会话是 "Agent Alpha"