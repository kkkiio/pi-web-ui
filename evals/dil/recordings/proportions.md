<box gap={3} padding={3} background="surface-secondary" radius="lg">
  <row justify="between" align="baseline">
    <text size="lg" weight="semibold">128k Context Window 占用分布</text>
    <caption>总计 131,072 tokens · 已满 100%</caption>
  </row>

  <box height="44px" radius="md" border>
    <row gap={0} height="100%">
      <box width="12%" height="100%" background="surface-tertiary" radius={{size: 0, color: "surface"}}>
      </box>
      <box width="28%" height="100%" background="warning">
      </box>
      <box width="45%" height="100%" background="danger">
      </box>
      <box width="15%" height="100%" background="surface">
      </box>
    </row>
  </box>

  <row gap={4}>
    <row gap={1} align="center"><box width="10px" height="10px" radius="full" background="surface-tertiary"/><caption>System Prompt</caption></row>
    <row gap={1} align="center"><box width="10px" height="10px" radius="full" background="warning"/><caption>Tool Definitions</caption></row>
    <row gap={1} align="center"><box width="10px" height="10px" radius="full" background="danger"/><caption>File Reads</caption></row>
    <row gap={1} align="center"><box width="10px" height="10px" radius="full" background="surface"/><caption>Conversation</caption></row>
  </row>

  {#each [{ name: "System Prompt", pct: 12, tok: "15,728", color: "secondary", note: "角色设定 + DIL/工具使用规范" }, { name: "Tool Definitions", pct: 28, tok: "36,700", color: "warning", note: "所有工具的 JSON Schema" }, { name: "File Reads", pct: 45, tok: "58,982", color: "danger", note: "整文件读取的历史内容" }, { name: "Conversation", pct: 15, tok: "19,662", color: "secondary", note: "用户提问与模型回复" }] as s}
    <row justify="between" align="center" gap={2}>
      <row gap={2} align="center" flex>
        <box width="8px" height="8px" radius="full" background={s.color === "danger" ? "danger" : s.color === "warning" ? "warning" : "surface-tertiary"}/>
        <text size="sm" weight="medium">{s.name}</text>
        <caption>{s.note}</caption>
      </row>
      <row gap={3} align="center">
        <caption tabularNums>{s.tok} tok</caption>
        <text size="sm" weight="semibold" tabularNums color={s.pct >= 40 ? "danger" : s.pct >= 25 ? "warning" : "secondary"}>{s.pct}%</text>
        <box width={`${s.pct * 1.6}px`} height="8px" radius="full" background={s.color === "danger" ? "danger" : s.color === "warning" ? "warning" : "surface-tertiary"}/>
      </row>
    </row>
  {/each}
</box>

<box gap={2} padding={3} border radius="lg">
  <text weight="semibold">裁剪优先级</text>
  <caption>按「可回收 token ÷ 改动风险」排序</caption>

  <grid columns={3} gap={2}>
    <box padding={2} background="surface-secondary" radius="md">
      <row justify="between" align="center"><badge>P0</badge><text size="sm" color="danger" tabularNums>−45k</text></row>
      <text size="sm" weight="medium">File Reads</text>
      <caption>先 grep 定位再 read(offset, limit)；只读相关行段；读完后把结论写入对话，丢弃原文。</caption>
    </box>
    <box padding={2} background="surface-secondary" radius="md">
      <row justify="between" align="center"><badge>P1</badge><text size="sm" color="warning" tabularNums>−25k</text></row>
      <text size="sm" weight="medium">Tool Definitions</text>
      <caption>关闭未使用的 MCP server / 工具集；精简 description 与枚举；按任务阶段动态加载工具。</caption>
    </box>
    <box padding={2} background="surface-secondary" radius="md">
      <row justify="between" align="center"><badge>P2</badge><text size="sm" tabularNums>−6k</text></row>
      <text size="sm" weight="medium">System Prompt</text>
      <caption>移除与当前任务无关的示例与 DIL 组件说明；把长规范外置成按需加载的 skill。</caption>
    </box>
  </grid>

  <divider/>

  <row justify="between" align="center">
    <caption>裁剪后预估占用</caption>
    <text weight="semibold" tabularNums>≈ 40% · 约 52k / 128k</text>
  </row>
  <box height="12px" radius="full" background="surface-tertiary">
    <row gap={0} height="100%">
      <box width="8%" height="100%" background="surface-tertiary"/>
      <box width="10%" height="100%" background="warning" radius={{size: 0, color: "surface"}}/>
      <box width="12%" height="100%" background="danger" radius={{size: 0, color: "surface"}}/>
      <box width="15%" height="100%" background="surface" radius={{size: 0, color: "surface"}}/>
    </row>
  </box>
  <caption>System 5% · Tools 10% · Files 12% · Conversation 15% —— 剩余 60% 留给后续推理</caption>
</box>

<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">具体动作清单</text>
  {#each ["用 grep / find 先缩小范围，再用 read 的 offset+limit 只取命中行附近 40–80 行", "禁止整文件读取 >500 行的文件；需要全览时先看大纲（函数签名、导出列表）", "读过的文件用 3–5 行摘要替换原文，保留路径+行号引用", "把 5+ 轮前的工具调用结果从上下文中移除（compaction / 会话摘要）", "工具层面：只挂载当前任务的 server，MCP 工具描述控制在 1 行内", "把 DIL、代码风格等长规范拆成 skill，按需加载而不是常驻 System Prompt"] as tip, i}
    <row gap={2} align="start">
      <badge>{i + 1}</badge>
      <text size="sm">{tip}</text>
    </row>
  {/each}
</box>
