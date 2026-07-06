# language: zh-CN
功能: 聊天与会话同步

  场景: 刷新后从 Pi 会话恢复聊天内容
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    而且 我刷新 Pi Web UI
    那么 聊天区显示消息 "Update the workspace status docs."
    而且 聊天区显示消息 "Updated the workspace status docs."
    而且 聊天区显示工具调用 "write"

  场景: 发送消息后显示用户消息和助手回复
    假如 当前工作区是 git 仓库
    而且 agent 会返回普通助手回复
    当 我打开 Pi Web UI
    而且 我发送消息 "你好"
    那么 聊天区显示消息 "你好"
    而且 聊天区显示消息 "你好，Pi Web UI 已收到消息。"
    而且 输入框恢复可提交状态

  场景: 助手文本完成后变成普通消息
    假如 当前工作区是 git 仓库
    而且 agent 会返回普通助手回复
    当 我打开 Pi Web UI
    而且 我发送消息 "写一段说明"
    那么 聊天区显示消息 "你好，Pi Web UI 已收到消息。"
    而且 输入框恢复可提交状态

  场景: 工具调用从执行中更新为成功结果
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    那么 聊天区显示工具调用 "write"
    而且 聊天区显示消息 "Updated the workspace status docs."

  场景: 工具调用失败后显示错误状态
    假如 当前工作区是 git 仓库
    而且 agent 会执行失败的 write 工具
    当 我打开 Pi Web UI
    而且 我发送消息 "执行失败工具"
    那么 聊天区显示工具调用 "write"
    而且 聊天区显示工具错误状态
