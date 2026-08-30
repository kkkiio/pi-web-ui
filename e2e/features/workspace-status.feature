# language: zh-CN
功能: Git 状态与变更面板

  场景: header 显示 git 状态并打开 diff 面板
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    那么 header 显示当前分支
    而且 header 显示 git additions 和 deletions

    当 我打开 header 的 git 状态
    那么 右侧详情面板显示 git diff tab

  场景: 非 git workspace 不显示 git 状态
    假如 当前工作区不是 git 仓库
    当 我打开 Pi Web UI
    那么 header 不显示 git 状态

  场景: clean git workspace 不显示 diff 统计
    假如 当前工作区是 git 仓库
    当 我打开 Pi Web UI
    那么 header 显示当前分支
    而且 header 不显示 git additions 和 deletions

  场景: 重复打开 Changes 不创建重复 tab
    假如 当前工作区是 git 仓库
    而且 agent 会更新 workspace status 文档
    当 我打开 Pi Web UI
    而且 我让 agent 更新 workspace status 文档
    而且 我打开 header 的 git 状态
    而且 我再次打开 header 的 git 状态
    那么 右侧详情面板只显示一个 Changes tab

  场景: 关闭最后一个 tab 后详情面板隐藏
    假如 当前工作区是 git 仓库
    当 我打开 Pi Web UI
    而且 我打开 header 的 git 状态
    而且 我关闭当前右侧详情 tab
    那么 右侧详情面板隐藏
    而且 显示恢复详情面板按钮
