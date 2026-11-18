Git 里的“状态”其实横跨三个存储区：**工作区 (Working Tree)**、**暂存区 (Index/Staging)**、**本地仓库 (HEAD/Objects)**、**远端 (Remote)**。文件在它们之间移动，就是一个“复制内容 + 改指针”的过程。

## 1. 流转图

你列出的 `Untracked → Staged → Modified → Committed → Pushed` 是一条常见的**心智模型**，但严格来说 `Modified` 不是必经环节：新文件直接 Untracked→Staged，已跟踪文件才会有 Modified。实际是两条路径：

<box padding={3} background="surface-secondary" radius="lg" gap={3}>
  <caption>路径 A：新文件首次入库</caption>
  <row gap={2} align="center" justify="center">
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Untracked</text><caption>未跟踪</caption></col></box>
    <icon name="arrow-right" size="sm"/>
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Staged</text><caption>已暂存</caption></col></box>
    <icon name="arrow-right" size="sm"/>
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Committed</text><caption>已提交</caption></col></box>
    <icon name="arrow-right" size="sm"/>
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Pushed</text><caption>已推送</caption></col></box>
  </row>
  <caption>命令：git add → git commit → git push</caption>
</box>

<box padding={3} background="surface-secondary" radius="lg" gap={3}>
  <caption>路径 B：已跟踪文件的循环修改</caption>
  <row gap={2} align="center" justify="center">
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Modified</text><caption>已改未暂存</caption></col></box>
    <icon name="arrow-right" size="sm"/>
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Staged</text><caption>已暂存</caption></col></box>
    <icon name="arrow-right" size="sm"/>
    <box padding={2} radius="md" border background="surface" width="100%"><col gap={0}><text weight="semibold" size="sm">Committed</text><caption>新提交</caption></col></box>
  </row>
  <row gap={2} align="center">
    <icon name="info" size="sm"/>
    <caption>Staged 也可通过 restore --staged 退回 Modified；Modified 也可被 restore 直接丢弃回 HEAD 版本</caption>
  </row>
</box>

## 2. 每次转换对应的命令 + 可逆性

| # | 转换 | 命令 | 内容可逆? | 反向操作 |
|---|------|------|:--:|------|
| 1 | Untracked → Staged | `git add <f>` | ✅ | `git restore --staged <f>` |
| 2 | Staged → Untracked（取消跟踪） | `git rm --cached <f>` | ✅ | `git add <f>` |
| 3 | Staged → Modified（取消暂存） | `git restore --staged <f>` | ✅ | `git add <f>` |
| 4 | Modified → Staged | `git add <f>` | ✅ | `git restore --staged <f>` |
| 5 | Modified/Staged → 丢弃回 HEAD | `git restore <f>` / `git restore .` | ❌ | 无（未提交内容真丢失） |
| 6 | Staged → Committed | `git commit -m "..."` | ✅ | `git reset --soft HEAD~1` |
| 7 | Committed → Staged（撤销提交） | `git reset --soft HEAD~1` | ✅ | `git commit` |
| 8 | Committed → Modified（撤销并回工作区） | `git reset HEAD~1`（= `--mixed`） | ✅ | `git add` + `commit` |
| 9 | Committed → 全丢弃 | `git reset --hard HEAD~1` | ⚠️ 部分 | 提交本身可从 reflog 找回，工作区改动丢失 |
| 10 | 修改最近一次提交 | `git commit --amend` | ✅ | `git reset --soft HEAD@{1}` |
| 11 | Committed → Pushed | `git push` | ✅（本地侧） | 见 #12 / #13 |
| 12 | 撤销已推送（安全） | `git revert <sha>` + `git push` | ✅ | 再 `revert` 一次 |
| 13 | 回退已推送并强推 | `git reset --hard <sha>` + `git push --force-with-lease` | ❌ 重写历史 | 本地 reflog 可恢复，远端他人需重新同步 |
| 14 | 删除未跟踪文件 | `git clean -fd` | ❌ | 从未入过索引则无法找回 |

## 3. 哪些是不可逆的

<grid columns={2}>
  <box padding={3} background="surface-secondary" radius="lg" gap={2} border={{size:1, color:"success"}}>
    <row gap={2} align="center"><icon name="check-circle" size="sm"/><text weight="semibold" size="sm">可逆（内容仍在某个存储区）</text></row>
    <text size="sm">• 取消暂存、取消跟踪：内容还在工作区</text>
    <text size="sm">• 撤销 commit（soft/mixed）：内容在索引或工作区</text>
    <text size="sm">• 已提交的东西：`git reflog` 兜底（默认约 90 天）</text>
    <text size="sm">• 未提交改动的临时保存：`git stash` / `git stash pop`</text>
    <text size="sm">• 已推送后想撤销：`git revert` 生成反向提交（推荐）</text>
  </box>
  <box padding={3} background="surface-secondary" radius="lg" gap={2} border={{size:1, color:"danger"}}>
    <row gap={2} align="center"><icon name="alert-triangle" size="sm"/><text weight="semibold" size="sm">不可逆 / 高风险</text></row>
    <text size="sm">• `git restore <f>`、`git checkout -- <f>`：丢弃未暂存改动，真丢</text>
    <text size="sm">• `git reset --hard`：丢弃工作区+索引（仅已提交部分可 reflog 找回）</text>
    <text size="sm">• `git clean -fd`：删掉 untracked，未入索引就无法恢复</text>
    <text size="sm">• `git push --force`：重写远端历史，影响所有协作者</text>
    <text size="sm">• “取消推送”本质不存在：只能 revert 或强推重写</text>
  </box>
</grid>

## 4. 三个安全网

<box padding={3} background="surface-secondary" radius="lg" gap={2}>
  <row justify="between" align="center"><text weight="semibold" size="sm">git reflog</text><caption>只救「提交过的」东西</caption></row>
  <row justify="between" align="center"><text weight="semibold" size="sm">git stash</text><caption>暂存未提交改动，可 pop 回来</caption></row>
  <row justify="between" align="center"><text weight="semibold" size="sm">git fsck --lost-found</text><caption>曾 `git add` 过的孤立 blob 仍可能找回</caption></row>
</box>

**一句话结论**：往“更早、更本地”的方向走（unstage、undo commit、stash）基本都可逆；往“丢弃、删文件、改远端历史”的方向走（restore 未暂存、reset --hard 工作区、clean、force push）基本都不可逆。未 `git add` 且未 `git commit` 的内容，Git 不负责保管。

<box padding={3} background="surface-tertiary" radius="md">
  <row gap={2} align="center"><icon name="terminal" size="sm"/><text size="sm">随时确认状态：<code>git status -s</code>（两列：左=暂存区，右=工作区）、<code>git diff</code>（工作区 vs 暂存）、<code>git diff --staged</code>（暂存 vs HEAD）</text></row>
</box>
