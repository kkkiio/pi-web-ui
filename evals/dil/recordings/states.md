# Git 工作区文件状态流转

<box padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">核心链路</text>
  <text><code>Untracked</code> → <code>Staged</code> → <code>Committed</code> → <code>Pushed</code>；<code>Modified</code> 是已跟踪文件在「工作区」与「暂存区」之间的并行状态，可随时插回链路。</text>
</box>

## 状态与命令对照

<grid columns={2} gap={3}>
  <grid-item>
    <box padding={2} radius="md" border>
      <title>1. Untracked → Staged</title>
      <text><code>git add &lt;file&gt;</code> ／ <code>git add -A</code></text>
      <caption>新增文件从未跟踪进入暂存区。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} radius="md" border>
      <title>2. Staged → Committed</title>
      <text><code>git commit -m "msg"</code></text>
      <caption>暂存快照写入本地仓库历史。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} radius="md" border>
      <title>3. Committed → Pushed</title>
      <text><code>git push</code> ／ <code>git push -u origin main</code></text>
      <caption>本地提交同步到远程。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} radius="md" border>
      <title>4. Tracked → Modified</title>
      <text>编辑文件后自动产生，<code>git status</code> 可见</text>
      <caption>已跟踪文件改动未再暂存。</caption>
    </box>
  </grid-item>
</grid>

## 回退与可逆性

<box padding={3} background="surface-tertiary" radius="lg">
  <row align="between">
    <text weight="medium">转换</text>
    <text weight="medium">是否可逆</text>
  </row>
  <divider/>
  <row align="between"><text>Untracked → Staged</text><badge color="success">可逆</badge></row>
  <text><code>git restore --staged &lt;file&gt;</code> ／ <code>git rm --cached &lt;file&gt;</code></text>
  <divider/>
  <row align="between"><text>Modified → Staged</text><badge color="success">可逆</badge></row>
  <text><code>git restore --staged</code> 退回暂存，<code>git restore</code> 丢弃工作区改动</text>
  <divider/>
  <row align="between"><text>Staged → Committed</text><badge color="warning">半可逆</badge></row>
  <text>已提交内容靠 <code>git reset --soft HEAD~1</code> 回到暂存区；若已推送历史改写需 <code>push --force-with-lease</code></text>
  <divider/>
  <row align="between"><text>Committed → Pushed</text><badge color="danger">本地不可单方撤回</badge></row>
  <text>远程同步无法由本地单方面撤销；只能 <code>git revert</code> 生成反向提交再推送。</text>
</box>

<box padding={3} background="surface" radius="lg" border color="warning">
  <row gap={2} align="center"><icon name="alert-triangle"/><text weight="semibold">容易踩坑的点</text></row>
  <text>· <code>git restore &lt;file&gt;</code> 丢弃未暂存修改，<bold>不可恢复</bold>（除非编辑器有备份）。</text>
  <text>· <code>git reset --hard</code> 同时丢弃暂存与工作区改动，同样不可逆。</text>
  <text>· 提交历史已推送，优先用 <code>revert</code> 而不是 <code>reset</code>，避免影响协作者。</text>
</box>

**一句话总结**：暂存与工作区之间（add、restore、reset --soft）可自由往返；提交进入历史后可用 reset、revert 处理；推送到远程后，本地只能追加更正提交，无法单方擦除。
