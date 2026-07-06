# language: zh-CN
功能: 工作区状态

  场景: 打开 git diff 和 workspace 内 artifact
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    那么 Workspace Float 显示当前分支
    而且 Workspace Float 显示 git additions 和 deletions
    而且 Workspace Float 显示 Markdown artifact

    当 我打开 Markdown artifact
    那么 右侧详情面板显示 artifact 文件内容

    当 我隐藏右侧详情面板
    而且 我打开 Changes 行
    那么 右侧详情面板显示 git diff tab

  场景: 打开 workspace 外 artifact
    假如 当前工作区是 git 仓库
    而且 agent 会写入 workspace 外 Markdown artifact
    当 我打开 Pi Web UI
    而且 我让 agent 更新 external skill 文档
    那么 Workspace Float 显示 workspace 外 Markdown artifact

    当 我打开 workspace 外 Markdown artifact
    那么 右侧详情面板显示 workspace 外 artifact 文件内容

  场景: 非 git workspace 显示 git 状态不可用
    假如 当前工作区不是 git 仓库
    当 我打开 Pi Web UI
    那么 Workspace Float 显示 git 状态不可用

  场景: clean git workspace 不显示 diff 统计
    假如 当前工作区是 git 仓库
    当 我打开 Pi Web UI
    那么 Workspace Float 显示当前分支
    而且 Workspace Float 显示没有变更
    而且 Workspace Float 不显示 git additions 和 deletions

  场景: 重复打开 Changes 不创建重复 tab
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    而且 我打开 Changes 行
    而且 我再次打开 Changes 行
    那么 右侧详情面板只显示一个 Changes tab

  场景: 关闭最后一个 tab 后详情面板隐藏
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    而且 我打开 Markdown artifact
    而且 我关闭当前右侧详情 tab
    那么 右侧详情面板隐藏
    而且 显示恢复详情面板按钮

  场景: 重复写同一个 Markdown 文件只显示一个 artifact
    假如 当前工作区是 git 仓库
    而且 agent 会重复写入同一个 Markdown artifact
    当 我打开 Pi Web UI
    而且 我让 agent 重复更新同一个 artifact
    那么 Workspace Float 只显示一个 Markdown artifact
