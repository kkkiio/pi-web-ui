你的场景很适合把 **GitHub Issues 当作多 Agent 协作的工作队列（Work Queue）和长期决策记录（Decision Log）**。

而且 GitHub 社区已经有比较成熟的分类习惯，不必从零设计。

我建议采用一套类似 **GitHub + VS Code + Kubernetes** 的 Issue 管理模型，再针对 Agent 做一些扩展。

核心原则是：

**Issue = 要跟踪的事情；Label = 分类与属性；Project = 工作流；Milestone = 版本交付目标；Agent = 执行工作流的角色。**

## 1. GitHub 社区常见的 Issue Labels

GitHub 新仓库默认包含 `bug`、`enhancement`、`documentation`、`duplicate`、`invalid`、`question`、`wontfix`、`good first issue`、`help wanted` 等标签。<Cite ref="turn316181search3"/>

像 VS Code 会进一步使用 `feature-request`、`debt`、`needs more info`、`under-discussion`、`not-reproducible`；Kubernetes 则倾向于用 `kind/*`、`priority/*`、`area/*` 这样的命名空间管理标签。<Cite refs={["turn917048search0","turn917048search12"]}/>

结合你的目标，我推荐分成以下六个维度。

### A. Type — 这是什么事情？

| Label | 作用 |
|---|---|
| `type/feedback` | 用户反馈，尚未确定是否需要开发 |
| `type/bug` | 现有功能没有按预期工作 |
| `type/feature` | 新功能、新能力或行为变更 |
| `type/task` | 明确的执行任务 |
| `type/refactor` | 重构、技术债、内部优化 |
| `type/design` | 架构方案、设计决策、技术探索 |
| `type/docs` | 文档相关任务 |

注意三组区别：

- `feedback` 是一个**输入**，还未必是开发需求。
- `feature` 是一个**产品能力或需求**，可以进一步拆成多个 `task`。
- `design` 是一个**待决策的设计问题**，未必已经可以进入开发。

GitHub 现在也有原生 **Issue Types**，组织默认支持 `Task`、`Bug`、`Feature`，并且允许自定义。若你使用 GitHub Organization，可以优先用 Issue Type 表达这个维度，而不必重复创建全部 `type/*` labels。<Cite ref="turn316181search1"/>

### B. Triage — 需要怎么处理？

| Label | 含义 |
|---|---|
| `triage/pending` | 新 Issue，尚未审核 |
| `triage/needs-info` | 信息不足，需要补充 |
| `triage/needs-repro` | Bug 需要复现 |
| `triage/needs-design` | 需要架构或技术评审 |
| `triage/needs-decision` | 等待产品或人的决策 |

这一类 Label 对 Triage Agent 特别有价值。

### C. Priority — 优先级

| Label | 含义 |
|---|---|
| `priority/P0` | 紧急事故，需要立即处理 |
| `priority/P1` | 高优先级，影响关键能力 |
| `priority/P2` | 正常优先级 |
| `priority/P3` | 低优先级，可延后 |

这里要特别注意：**Priority ≠ Severity（严重程度）**。

例如一个影响极少数人的崩溃 Bug，严重程度可能很高，但未必是当前最优先开发的任务。早期可以先只有 Priority，不必增加复杂度。

### D. Area — 属于哪个系统模块？

例如：

`area/agent-runtime`、`area/memory`、`area/api`、`area/ui`、`area/orchestration`、`area/infrastructure`

这有助于分配给具备相应上下文或能力的 Agent。

### E. Source — 来源是什么？

这是我特别建议你为 Agent 系统增加的一类元数据。

| Label | 含义 |
|---|---|
| `source/user` | 最初来自真实用户反馈 |
| `source/owner` | 来自你自己的产品意图 |
| `source/agent` | Agent 主动发现或提出 |
| `source/monitoring` | 日志、指标、告警发现 |

例如，一个 Issue 经过 Triage 从 `feedback` 转成了 `bug`，它仍然可以保留 `source/user`。

**Type 可以变化，但 Source 通常应保留**，这样你未来就能分析哪些工作是用户驱动，哪些是 Agent 自主提出的。

### F. Resolution — 为什么关闭？

| Label | 含义 |
|---|---|
| `resolution/duplicate` | 与已有 Issue 重复 |
| `resolution/cannot-reproduce` | 尝试过，但无法复现 |
| `resolution/wontfix` | 确认不修复 |
| `resolution/by-design` | 属于预期设计行为 |
| `resolution/invalid` | 无效或不属于项目范围 |

你提到的 **`can't reproduce`** 就属于这里，但建议区分两种情况：

- `triage/needs-repro`：仍在调查，Issue 保持 Open。
- `resolution/cannot-reproduce`：经过调查仍不可复现，记录理由后 Close。

这比一个模糊的 `can't reproduce` 标签更适合自动化，因为 Agent 能明确判断下一步动作。

---

## 2. vX.X.X、Roadmap、Sprint 应该怎么管理？

**我不建议创建 `v0.3.0`、`v0.4.0` 这样的版本 Label。**

GitHub 已经有专门的 Milestones 和 Projects 机制。

| 需求 | 推荐使用 | 示例 |
|---|---|---|
| 哪个版本交付 | Milestone | `v0.4.0` |
| 哪个 Sprint 执行 | Project Iteration | `Sprint 12` |
| 目前进度 | Project Status | `In Progress` |
| 任务优先级 | Label 或 Priority Field | `P1` |
| 属于什么方向 | Area Label | `area/memory` |
| Feature 的拆分 | Parent / Sub-issues | Feature → Tasks |
| Issue 间的前置关系 | Dependencies | Blocked by #123 |

GitHub Milestones 原生支持截止日期、完成百分比、Open/Closed Issue 统计；Projects 则提供 Iteration、Status、Roadmap 时间线等能力。<Cite refs={["turn316181search12","turn316181search2","turn316181search4"]}/>

例如：

<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    **Milestone: v0.4.0**
    <badge color="info">Release</badge>
  </row>
  <text color="secondary" size="xs">Agent Memory Improvements</text>
  <box background="surface-tertiary" radius="full" height="8px" clip>
    <box background="rgba(34,139,94,0.85)" width="50%" height="100%" radius="full"/>
  </box>
  <row justify="between">
    <text size="xs" color="secondary">2 / 4 issues completed</text>
    <text size="xs" weight="medium">50%</text>
  </row>
  <divider color="subtle"/>
  <row align="center" gap={2}>
    <icon name="circle-check" color="success"/>
    <box flex="1" gap={1}>
      <text color="secondary" lineThrough>Memory storage API</text>
      <caption>Task · Sprint 11</caption>
    </box>
  </row>
  <row align="center" gap={2}>
    <icon name="circle-check" color="success"/>
    <box flex="1" gap={1}>
      <text color="secondary" lineThrough>Memory retrieval tests</text>
      <caption>Task · Sprint 11</caption>
    </box>
  </row>
  <row align="center" gap={2}>
    <icon name="circle-dot" color="info"/>
    <box flex="1" gap={1}>
      **Cross-session memory**
      <caption>Feature · Sprint 12</caption>
    </box>
  </row>
  <row align="center" gap={2}>
    <icon name="circle" color="tertiary"/>
    <box flex="1" gap={1}>
      **Memory eviction policy**
      <caption>Design · Not scheduled</caption>
    </box>
  </row>
  <caption>示意数据：一个版本可以跨多个 Sprint，未安排 Sprint 的工作也可以先进入版本计划。</caption>
</box>

一个比较清晰的职责边界是：

- **Roadmap**：未来几个月要建设哪些能力。
- **Release / Milestone**：承诺某个版本要交付什么。
- **Sprint / Iteration**：接下来一段时间实际做什么。

这三层最好不要混成一个维度。

## 3. 我建议的多 Agent 工作流

你描述的系统，本质上可以分成四个职责明确的 Agent。

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    <row align="center" gap={2}>
      <icon name="inbox" color="secondary"/>
      **Issue Inbox**
    </row>
    <text color="secondary" size="xs" textAlign="center">用户反馈 · 你的需求 · Agent 主动发现的问题</text>
  </box>
  <box align="center">
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box border radius="lg" padding={3} gap={1} height="100%">
        <row align="center" gap={2}>
          <icon name="list-filter" color="info"/>
          **Triage Agent**
        </row>
        <text size="xs" color="secondary">去重、归类、补充信息、清理无效 Issue</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} gap={1} height="100%">
        <row align="center" gap={2}>
          <icon name="calendar-range" color="info"/>
          **PM Agent**
        </row>
        <text size="xs" color="secondary">评估价值、优先级、Roadmap、Release、Sprint</text>
      </box>
    </grid-item>
  </grid>
  <box align="center">
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <box border radius="lg" padding={3} gap={1} align="center">
    <row align="center" gap={2}>
      <icon name="code-2" color="info"/>
      **Engineering Agent**
    </row>
    <text color="secondary" size="xs">拆分 Task · 实现 · 测试 · 提交 PR</text>
  </box>
  <box align="center">
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <box border radius="lg" padding={3} gap={1} align="center">
    <row align="center" gap={2}>
      <icon name="shield-check" color="success"/>
      **Review / QA Agent**
    </row>
    <text color="secondary" size="xs">Review PR · 检查验收条件 · 验证修复</text>
  </box>
  <box align="center">
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    **Done / Release**
    <text color="secondary" size="xs">关闭 Issue · 保留反馈与实现关系</text>
  </box>
</box>

### 一个具体的例子

假设某用户提出：

> Agent 有时候忘记之前对话中约定的事情。

**第一步：Feedback Agent**

创建 Issue #101：

`[Feedback] Agent forgets previously agreed decisions`

带上 `type/feedback`、`source/user`、`triage/pending`。

正文记录原始反馈、发生场景、时间、来源引用。不要直接猜测这是 Bug 还是 Feature。

**第二步：Triage Agent**

检查是否存在相似 Issue，调查产品原本是否承诺记住这类信息。

如果确认已有功能不符合预期，则转成 `type/bug`；如果产品本来就不具备跨会话记忆，则整理成 `type/feature`。

假设是 Feature，于是形成：

Issue #120：`Support persistent agent decisions across sessions`

并在 Issue #101 里记录关联关系。可以将 #101 作为已分流的反馈关闭，但 #120 仍然 Open。

**第三步：PM Agent**

为 #120 设定：

- Priority：`P1`
- Milestone：`v0.4.0`
- Iteration：`Sprint 12`
- Status：`Planned`

**第四步：Engineering Agent**

把 Feature 拆成 Sub-issues：

- #121：Implement persistent decision storage
- #122：Implement decision retrieval
- #123：Add regression tests

GitHub 原生支持 Sub-issues 和 Issue Dependencies，因此不需要用 `parent:#120` 这种自定义 Label 模拟关系。<Cite refs={["turn316181search15","turn892564search1"]}/>

**第五步：QA Agent**

验证全部 Acceptance Criteria 后，再由受权流程把 Feature 关闭为 Completed。

---

## 4. 最重要的设计：Issue 的状态机

我建议在 GitHub Project 中配置以下 Status：

<box border radius="lg" padding={3} gap={2}>
  <grid columns={3} gap={2}>
    {#each [{s:"Inbox",d:"待分类"},{s:"Backlog",d:"已接受，未排期"},{s:"Ready",d:"条件完整，可执行"},{s:"In Progress",d:"开发中"},{s:"In Review",d:"待评审/验收"},{s:"Done",d:"工作完成"}] as item,i}
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} gap={1} align="center">
          <text weight="medium" size="sm">{item.s}</text>
          <text color="secondary" size="2xs">{item.d}</text>
        </box>
      </grid-item>
    {/each}
  </grid>
  <caption>另外通过 `triage/needs-info` 等标签标识等待原因，而不必把所有特殊情况做成独立的 Status。</caption>
</box>

Status 是业务工作流状态，Open/Closed 是 GitHub Issue 的生命周期，二者不能完全等同。

例如：

- Feature 已进入 Backlog：Open。
- Bug 等待用户补充信息：Open。
- Feedback 已合并到另一个 Issue：可以 Closed，但并不代表问题已修复。
- 开发完毕且完成验收：Closed，reason 为 Completed。
- 决定不做或无法继续调查：Closed，reason 为 Not planned，并通过 Resolution Label 记录具体原因。

GitHub 已有 Completed / Not planned 等关闭原因，所以你不需要再用 `status/closed` 标签重复记录。<Cite ref="turn892564search0"/>

## 5. Agent 自动化需要几条约束

我认为这里比 Label 命名更重要，因为如果 Agent 可以自由创建、关闭和分配 Issue，你的 Backlog 很快会失控。

| 规则 | 原因 |
|---|---|
| 创建 Issue 前先搜索相似 Issue | 防止多个 Agent 重复创建 |
| 每个 Issue 有明确的验收标准 | 防止执行 Agent 自行重新解释需求 |
| Triage Agent 不擅自改变产品意图 | 避免误把反馈认定为 Bug |
| PM Agent 不能凭空制造优先级 | 应基于你的目标、价值与资源约束 |
| Release 承诺和重大架构变化需要审批 | 避免 Agent 自主修改产品方向 |
| 关闭 Issue 时必须记录原因及关联关系 | 留下可追溯的决策记录 |

还建议在 Issue 正文保留几个稳定字段，尤其是 `Problem / Intent`、`Evidence`、`Expected Outcome`、`Acceptance Criteria`、`Related Issues`。

当 Agent 产生的只是一个未经确认的构想时，应该标注为 Proposal，而不是直接作为已经批准的 Feature 进入 Sprint。

GitHub Issue Forms 支持不同模板和预设 labels，可以让用户反馈、Bug、Feature、Design 从创建之初就有规范的输入结构。<Cite ref="turn917048search11"/>

## 6. 我会从一个精简版本开始

即使上面列了很多类别，也不建议你第一天就创建 30 个 Labels。

你的第一版可以只设这些：

<box border radius="lg" padding={3} gap={3}>
  <row wrap="wrap" gap={1}>
    {#each ["type/feedback","type/bug","type/feature","type/task","type/design","triage/pending","triage/needs-info","priority/P1","priority/P2","priority/P3","source/user","source/owner","source/agent","resolution/duplicate","resolution/cannot-reproduce","resolution/wontfix"] as name}
      <box background="surface-secondary" radius="sm" padding={{x:2,y:1}}>
        <text size="xs" weight="medium">{name}</text>
      </box>
    {/each}
  </row>
  <caption>建议起步标签集合。若使用原生 Issue Types，可去掉对应的 type labels。</caption>
</box>

然后配置一个 GitHub Project，包含 Status、Priority、Iteration；使用 Milestones 管理 `v0.1.0`、`v0.2.0` 等版本。

最开始只需要真正运行两个自动化流程：**每天 Triage 一次；每周 PM Planning 一次**。等这两个流程稳定了，再把 Engineering 和 QA Agent 接进来。

GitHub Projects 自带自动添加 Issue、Issue 关闭后更新 Status 等工作流；更复杂的 Agent 决策和操作则需要 GitHub Actions、GitHub App 或外部编排程序。<Cite ref="turn917048search2"/>

---

## 7. 我还会补充一个架构建议

**不要让 Issue 同时承担「原始反馈」和「最终实施任务」这两种角色。**

在项目初期，允许 Triage 直接把 Feedback Issue 修改成 Bug/Feature 是简单有效的。

但随着用户反馈增多，我更推荐：

<box background="surface-secondary" radius="lg" padding={3} gap={2}>
  <row align="center" gap={2}>
    <icon name="messages-square" color="secondary"/>
    <box flex="1">
      **Feedback Issues**

      <text size="xs" color="secondary">#101、#108、#115：多条用户反馈</text>
    </box>
  </row>
  <box padding={{left:2}}>
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <row align="center" gap={2}>
    <icon name="git-merge" color="info"/>
    <box flex="1">
      **Canonical Feature / Bug**

      <text size="xs" color="secondary">#120：归纳后的单一需求</text>
    </box>
  </row>
  <box padding={{left:2}}>
    <icon name="arrow-down" color="tertiary"/>
  </box>
  <row align="center" gap={2}>
    <icon name="git-branch" color="success"/>
    <box flex="1">
      **Implementation Tasks**

      <text size="xs" color="secondary">#121、#122、#123：可以实际执行的工作</text>
    </box>
  </row>
</box>

这样你就能同时保留：

- 原始用户诉求及其频次。
- PM 整理后的产品需求和优先级。
- 工程实施记录及验收状态。

不会因为关闭或合并反馈，就丢掉实际需求有多强烈的证据。

**最终，我会把这套系统设计成：GitHub Issues 是事实记录和工作单元，GitHub Projects 是状态与调度视图，Agent 通过明确的权限和状态转换协议进行协作。**

这比单纯设计一堆 Label 更适合长期演进成一个自主运作、但仍受你控制的多 Agent 软件开发系统。