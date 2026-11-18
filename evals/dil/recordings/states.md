Git 中文件的状态本质上是它在**四个区域**之间的位置，`git status` 只是把位置翻译成标签。

<box gap={3} padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">四个区域与搬运命令</text>
  <row gap={2} align="center" justify="between">
    <col gap={1} align="center" flex>
      <badge>工作区</badge>
      <caption>Worktree</caption>
      <caption>编辑 / 新建的文件</caption>
    </col>
    <col gap={1} align="center">
      <icon name="arrow-right" size="sm"/>
      <caption size="2xs">git add</caption>
      <caption size="2xs" color="secondary">git restore</caption>
    </col>
    <col gap={1} align="center" flex>
      <badge>暂存区</badge>
      <caption>Index / Stage</caption>
      <caption>下一次提交的快照</caption>
    </col>
    <col gap={1} align="center">
      <icon name="arrow-right" size="sm"/>
      <caption size="2xs">git commit</caption>
    </col>
    <col gap={1} align="center" flex>
      <badge>本地仓库</badge>
      <caption>.git / HEAD</caption>
      <caption>已生成 commit</caption>
    </col>
    <col gap={1} align="center">
      <icon name="arrow-right" size="sm"/>
      <caption size="2xs">git push</caption>
      <caption size="2xs" color="warning">git fetch</caption>
    </col>
    <col gap={1} align="center" flex>
      <badge>远程仓库</badge>
      <caption>origin/main</caption>
      <caption>已共享</caption>
    </col>
  </row>
</box>

## 状态机（单向推进 + 回退）

<box gap={2}>
  {#each [
    { from: "Untracked", to: "Staged", cmd: "git add <file>", color: "success" },
    { from: "Modified", to: "Staged", cmd: "git add <file> / git add -p", color: "success" },
    { from: "Staged", to: "Committed", cmd: "git commit -m \"...\"", color: "success" },
    { from: "Committed", to: "Pushed", cmd: "git push", color: "success" }
  ] as step}
    <row gap={2} align="center">
      <box padding={{x: 2, y: 1}} background="surface-tertiary" radius="sm" width="110px">
        <caption>{step.from}</caption>
      </box>
      <icon name="arrow-right" size="sm"/>
      <box padding={{x: 2, y: 1}} background="surface-tertiary" radius="sm" width="110px">
        <caption>{step.to}</caption>
      </box>
      <code>{step.cmd}</code>
    </row>
  {/each}
  <divider/>
  <text weight="semibold" size="sm" color="warning">回退方向</text>
  {#each [
    { from: "Staged", to: "Modified / Untracked", cmd: "git restore --staged <file>" },
    { from: "Modified", to: "原样（丢弃改动）", cmd: "git restore <file>" },
    { from: "Committed", to: "改写历史", cmd: "git commit --amend / git reset" },
    { from: "Pushed", to: "不可回退（团队共享）", cmd: "git revert <sha>" }
  ] as back}
    <row gap={2} align="center">
      <box padding={{x: 2, y: 1}} background="surface-secondary" radius="sm" width="110px">
        <caption>{back.from}</caption>
      </box>
      <icon name="arrow-left" size="sm"/>
      <box padding={{x: 2, y: 1}} background="surface-secondary" radius="sm" width="150px">
        <caption>{back.to}</caption>
      </box>
      <code>{back.cmd}</code>
    </row>
  {/each}
</box>

## 状态对照表

| 状态 | `git status` 归属 | 含义 | 推进命令 |
| --- | --- | --- | --- |
| Untracked | Untracked files | 从未被 Git 记录过 | `git add <file>` |
| Staged（新增） | Changes to be committed | 新文件进入索引 | `git commit` |
| Modified | Changes not staged | 已跟踪文件被改动，未暂存 | `git add` / `git add -p` |
| Staged（修改） | Changes to be committed | 改动已进索引 | `git commit` |
| Deleted | `deleted:` | 已跟踪文件被删除 | `git rm <file>` 或 `git add -A` |
| Committed | `nothing to commit` / ahead N | 已在本地历史 | `git push` |
| Pushed | `Your branch is up to date` | 已在远程分支 | — |

<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold" size="sm">易错点</text>
  <row gap={2} align="start"><icon name="check-circle" size="sm"/><text size="sm"><code>git commit -a</code> 只自动暂存<bold>已跟踪</bold>文件的修改，抓不到新文件。</text></row>
  <row gap={2} align="start"><icon name="check-circle" size="sm"/><text size="sm"><code>Staged</code> 与 <code>Modified</code> 可<bold>同时</bold>存在：同一文件 add 后又改动，两个区都非空。</text></row>
  <row gap={2} align="start"><icon name="check-circle" size="sm"/><text size="sm">Untracked 想永久忽略，写 <code>.gitignore</code>，而不是每次手删。</text></row>
  <row gap={2} align="start"><icon name="check-circle" size="sm"/><text size="sm"><code>git add -A</code> = 暂存所有改动+删除+新增；<code>git add -u</code> 不含新增文件。</text></row>
</box>

一句话记忆：**add 搬进暂存区，commit 搬进本地历史，push 搬上远程**；每个 `git restore` 负责往回搬一格。
