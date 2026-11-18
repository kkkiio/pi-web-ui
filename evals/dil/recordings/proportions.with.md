<box gap={3} padding={3} background="surface" radius="lg" border>

<title>128K Context Window 占用分布</title>

<grid columns={2} gap={3}>
  <grid-item>
    <caption>按 Token 量</caption>
    <box gap={2} padding={2} background="surface-secondary" radius="md">
      {#each [{name:"File Reads", pct:45, tok:58982, color:"#e05d5d"}, {name:"Tool Definitions", pct:28, tok:36700, color:"#e8a33d"}, {name:"Conversation", pct:15, tok:19661, color:"#4d9de0"}, {name:"System Prompt", pct:12, tok:15729, color:"#8e8e93"}] as seg}
        <box gap={1}>
          <row justify="between">
            <text weight="medium">{seg.name}</text>
            <row gap={2}>
              <text weight="semibold">{seg.pct}%</text>
              <caption>{seg.tok.toLocaleString()} tok</caption>
            </row>
          </row>
          <box width="100%" height={10} background="surface-tertiary" radius="full">
            <box width={`${seg.pct}%`} height={10} background={seg.color} radius="full"/>
          </box>
        </box>
      {/each}
    </box>
  </grid-item>

  <grid-item>
    <caption>关键结论</caption>
    <box gap={2} padding={2} background="surface-secondary" radius="md">
      <row gap={2} align="center"><icon name="alert-triangle"/><text>File Reads 单项 <bold>45%</bold>，比 System + Tools 合计还多</text></row>
      <row gap={2} align="center"><icon name="alert-triangle"/><text>固定开销（System + Tools）<bold>40%</bold>，只剩 60% 给对话和文件</text></row>
      <row gap={2} align="center"><icon name="alert-triangle"/><text>Conversation 仅 15%，<bold>11.5% 的压缩率提升也远小于裁剪 File Reads</bold></text></row>
    </box>
  </grid-item>
</grid>

<divider/>

<title>裁剪优先级（按收益 / 成本比排序）</title>

<grid columns={4} gap={2}>
  <grid-item><badge color="danger">P0</badge></grid-item>
  <grid-item><text weight="semibold">File Reads</text></grid-item>
  <grid-item><caption>可回收 ~35–40%（约 20k+ tok）</caption></grid-item>
  <grid-item><badge color="success">成本低</badge></grid-item>

  <grid-item><badge color="warning">P1</badge></grid-item>
  <grid-item><text weight="semibold">Tool Definitions</text></grid-item>
  <grid-item><caption>可回收 ~40–60%（约 15–22k tok）</caption></grid-item>
  <grid-item><badge color="success">成本低</badge></grid-item>

  <grid-item><badge color="secondary">P2</badge></grid-item>
  <grid-item><text weight="semibold">System Prompt</text></grid-item>
  <grid-item><caption>可回收 ~30%（约 4–5k tok）</caption></grid-item>
  <grid-item><badge color="warning">成本中</badge></grid-item>

  <grid-item><badge color="secondary">P3</badge></grid-item>
  <grid-item><text weight="semibold">Conversation</text></grid-item>
  <grid-item><caption>可回收 ~50%（约 10k tok）</caption></grid-item>
  <grid-item><badge color="danger">影响质量</badge></grid-item>
</grid>

<divider/>

<caption>P0 · File Reads 从 58.9k 降到约 20k</caption>
<box gap={1} padding={2} background="surface-secondary" radius="md">
  <text>• `offset/limit` 分段读取，只取命中的行区间，不要整文件塞进上下文</text>
  <text>• 先 `grep`/搜索定位，再读 ±50 行窗口</text>
  <text>• 读完即摘要：把文件内容换成 200 字的「相关片段 + 结论」，原文出栈</text>
  <text>• 同一文件多轮对话只保留一份，旧版本用 diff 替代全文</text>
</box>

<caption>P1 · Tool Definitions 从 36.7k 降到约 18k</caption>
<box gap={1} padding={2} background="surface-secondary" radius="md">
  <text>• 按任务动态挂载工具子集（检索类 / 写入类分开），不要全量常驻</text>
  <text>• 精简 description 与参数 schema，去掉示例长段落</text>
  <text>• 合并粒度相近的工具，减少参数枚举项</text>
</box>

<caption>P2 · System Prompt 从 15.7k 降到约 10k</caption>
<box gap={1} padding={2} background="surface-secondary" radius="md">
  <text>• 把长规则表拆成按需注入的片段（prefilling / 条件拼接）</text>
  <text>• 删除与工具 description 重复的说明</text>
</box>

<divider/>

<title>裁剪后的预估占用</title>

<grid columns={2} gap={2}>
  <grid-item><caption>当前</caption><text weight="semibold">128k / 128k · 100%</text></grid-item>
  <grid-item><caption>裁剪后</caption><text weight="semibold" color="success">约 70k / 128k · 55%</text></grid-item>
</grid>

<row gap={2} align="center">
  <icon name="check-circle"/>
  <text>释放约 <bold>58k tokens</bold> 余量，对话轮次可翻倍且不会触发截断</text>
</row>

</box>
