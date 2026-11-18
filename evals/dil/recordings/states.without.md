# Git 文件状态流转与命令速查

## 一、核心状态流转图

```
                 git add              git commit           git push
Untracked ──────────────► Staged ──────────────► Committed ──────────► Pushed
                              ▲                     │                     │
                              │   git add           │ 修改文件             │ 修改文件
                              │                     ▼                     ▼
                           Staged ◄──────────── Modified ◄──────────── (工作区)
                              │                     │
                              │   git checkout --   │
                              └─────────────────────┘ (discard)
```

## 二、各状态说明与进入命令

| 状态 | 含义 | 进入命令 |
|------|------|----------|
| **Untracked** | 新文件，Git 从未跟踪 | 新建文件（`touch`/编辑生成） |
| **Staged** | 已加入暂存区，等待提交 | `git add <file>` |
| **Modified** | 已跟踪文件被修改，未暂存 | 编辑已跟踪文件 |
| **Committed** | 已提交到本地仓库 | `git commit -m "msg"` |
| **Pushed** | 已推送到远程仓库 | `git push` |

## 三、关键转换与命令

### 前进方向
| 转换 | 命令 |
|------|------|
| Untracked → Staged | `git add <file>` |
| Modified → Staged | `git add <file>`（或 `git add -u` 只加已跟踪） |
| Staged → Committed | `git commit -m "msg"` |
| Committed → Pushed | `git push` |

### 回退方向（哪些可逆）
| 转换 | 命令 | 可逆性说明 |
|------|------|-----------|
| Staged → Untracked | `git rm --cached <file>` | ✅ 完全可逆 |
| Staged → Modified | `git restore --staged <file>`（旧：`git reset HEAD <file>`） | ✅ 完全可逆 |
| Modified → 已提交版本 | `git restore <file>`（旧：`git checkout -- <file>`） | ⚠️ **丢弃工作区修改，不可恢复**（除非编辑器有备份） |
| Committed → Staged | `git reset --soft HEAD~1` | ✅ 可逆（提交变为暂存） |
| Committed → Modified | `git reset --mixed HEAD~1`（默认） | ⚠️ 提交撤销，修改保留在工作区 |
| Committed → 丢弃 | `git reset --hard HEAD~1` | ❌ **不可逆**，工作区修改一并丢失 |
| Pushed → Committed | `git push --force`（配合 reset） | ⚠️ 危险，若他人已拉取则破坏历史 |
| Pushed 回滚（安全方式） | `git revert <commit>` | ✅ 推荐，生成反向提交，历史不被改写 |

## 四、可逆性总结

**✅ 安全可逆（无损）**
- 暂存区 ↔ 工作区之间的来回（`git add` / `git restore --staged`）
- 提交历史回退但保留改动（`git reset --soft/--mixed`，只要之后还能找回）
- 已推送内容的回滚用 `git revert`（不改写历史）

**⚠️ 有损但可预防**
- `git restore <file>` / `git checkout -- <file>`：**丢弃未暂存修改**。若暂存过则可用 `git restore --staged` 后找不回工作区版本；只能靠编辑器/IDE 本地历史。
- `git reset --hard`：**丢弃工作区和暂存区改动**。可用 `git reflog` 找回提交，但工作区未提交内容无法找回。

**❌ 不可逆 / 高危**
- `git reset --hard` 后未提交的工作区修改（reflog 无法救）
- `git push --force` 覆盖远程历史（可能影响协作者；`--force-with-lease` 相对安全）
- 已 `git clean -fd` 删除的 Untracked 文件

## 五、实用查看命令

```bash
git status            # 查看当前各状态文件
git diff              # 工作区 vs 暂存区（Modified 内容）
git diff --staged     # 暂存区 vs 上次提交（Staged 内容）
git log --oneline     # 查看已提交历史
git reflog            # 找回误 reset 的提交（救命命令）
```

**记忆口诀**：`add` 前进、`restore --staged` 后退暂存、`restore` 丢工作区、`reset` 改提交、`revert` 安全回滚远程。**凡是带 `--hard` 或覆盖远程的操作，先确认再无退路。**
