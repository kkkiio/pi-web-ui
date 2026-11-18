<box gap={3}>
  <row justify="between" align="baseline">
    <title>128k Context Window 占用分布</title>
    <badge>128,000 tokens</badge>
  </row>

  <box height="28px" radius="md" background="surface-tertiary" border={{size: 1, color: "warning"}}>
    <row gap={0} height="100%">
      <box width="12%" height="100%" background="surface" radius="md" />
      <box width="28%" height="100%" background="surface-secondary" />
      <box width="45%" height="100%" background="surface" />
      <box width="15%" height="100%" background="surface-secondary" radius="md" />
    </row>
  </box>

  <grid columns={2} gap={2}>
    {#each [{ name: "System Prompt", p: 12, tok: "15.4k" }, { name: "Tool Definitions", p: 28, tok: "35.8k" }, { name: "File Reads", p: 45, tok: "57.6k" }, { name: "Conversation", p: 15, tok: "19.2k" }] as item}
      <box padding={2} border radius="md" gap={1}>
        <row justify="between" align="center">
          <text weight="semibold">{item.name}</text>
          <text tabularNums color={item.p >= 40 ? "danger" : item.p >= 25 ? "warning" : "secondary"}>{item.p}%</text>
        </row>
        <row justify="between" align="center">
          <caption>≈ {item.tok} tokens</caption>
          <caption>剩余 {100 - item.p}%</caption>
        </row>
        <box height="6px" radius="full" background="surface-tertiary">
          <box height="100%" radius="full" width={`${item.p}%`} background="surface" />
        </box>
      </box>
    {/each}
  </grid>

  <box padding={2} background="surface-secondary" radius="md" gap={1}>
    <row gap={2} align="center">
      <icon name="alert-triangle" size="sm" />
      <text weight="semibold">诊断</text>
    </row>
    <text>File Reads（45%，57.6k）是最大头，工具定义 35.8k 属异常偏高，两者合计 73% —— 核心问题是"一次性读太多、工具暴露太多"。</text>
  </box>
</box>

<box gap={3} padding={3} radius="lg" border>
  <row gap={2} align="center">
    <icon name="scissors" size="sm" />
    <text weight="semibold" size="lg">裁剪建议（按收益排序）</text>
  </row>

  {#each [
    { n: 1, title: "File Reads：改为按需 + 增量读取", gain: "可回收 30~40k", color: "danger",
      pts: [
        "禁止整仓/整文件通读，先用 grep/find 定位再 read 目标行段（offset/limit）",
        "长文件分段读，只保留与当前任务相关的代码块，其余丢弃",
        "读完即用即弃：把结论摘要写入上下文，而不是原始文件内容",
        "对大文件先看结构（函数名/导出列表）再决定读哪段"
      ] },
    { n: 2, title: "Tool Definitions：精简到当前任务所需", gain: "可回收 20~28k", color: "warning",
      pts: [
        "每个工具的描述/参数 schema 都是常驻成本，只加载本任务要用的工具集",
        "删除冗余工具（重复能力的 CLI 封装、从不调用的集成）",
        "缩短工具描述文案，去掉示例之外的重复说明",
        "用 MCP/子代理按需挂载重型工具，而不是全量常驻"
      ] },
    { n: 3, title: "System Prompt：删重复、去示例冗余", gain: "可回收 4~8k", color: "secondary",
      pts: [
        "规则去重，把长示例压缩为一行要点",
        "把低频规则移入可按需加载的 skill/文档",
        "保留硬约束（输出格式、安全边界），删掉软性风格说明"
      ] },
    { n: 4, title: "Conversation：滚动摘要 + 剪枝", gain: "可回收 8~12k", color: "secondary",
      pts: [
        "早期轮次折叠为要点摘要，只保留最近 N 轮原文",
        "删掉已被取代的中间尝试与失败输出",
        "工具返回的大块 JSON/日志先抽取字段再入上下文"
      ] }
  ] as s}
    <box gap={2} padding={2} radius="md" background="surface-secondary">
      <row justify="between" align="center">
        <row gap={2} align="center">
          <badge color={s.color}>#{s.n}</badge>
          <text weight="semibold">{s.title}</text>
        </row>
        <caption color={s.color}>{s.gain}</caption>
      </row>
      <col gap={1}>
        {#each s.pts as p}
          <row gap={2} align="start">
            <icon name="chevron-right" size="sm" />
            <text size="sm" color="secondary">{p}</text>
          </row>
        {/each}
      </col>
    </box>
  {/each}

  <divider/>

  <row justify="between" align="center" gap={2}>
    <row gap={2} align="center">
      <icon name="target" size="sm" />
      <text weight="semibold">目标形态</text>
    </row>
    <caption>裁剪后利用率 ≈ 55~65%，留出充足余量</caption>
  </row>

  <box height="24px" radius="md" background="surface-tertiary">
    <row gap={0} height="100%">
      <box width="8%" height="100%" background="surface" radius="md" />
      <box width="12%" height="100%" background="surface-secondary" />
      <box width="22%" height="100%" background="surface" />
      <box width="13%" height="100%" background="surface-secondary" radius="md" />
      <box width="45%" height="100%" background="surface-tertiary" />
    </row>
  </box>
  <row justify="between">
    <caption>Sys 8%</caption>
    <caption>Tools 12%</caption>
    <caption>Files 22%</caption>
    <caption>Conv 13%</caption>
    <caption color="success">Free 45%</caption>
  </row>
</box>

**关键判断：** 问题不在"上下文不够大"，而在前两类（System + Tools，40%）本可压缩到 20% 以内却长期常驻。优先做 ①File Reads 增量读取 ②Tool 按需挂载，两项即可回收 ~60k，其余三项是锦上添花。
