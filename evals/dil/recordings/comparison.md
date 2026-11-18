已读取当前实现（`src/web/src/components/dil/dil-renderer.tsx`、`src/web/src/core/dil/evaluator.ts`），下面的对比以现状为基准。

## 三个方案在同一条流水线上的切分点

<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <row align="center" gap={2}>
    <caption>流式文本</caption><icon name="arrow-right" size="sm"/>
    <caption>repair / parse → AST</caption><icon name="arrow-right" size="sm"/>
    <caption>scope 求值 {expr}</caption><icon name="arrow-right" size="sm"/>
    <caption>resolve → 组件树</caption><icon name="arrow-right" size="sm"/>
    <caption>React 渲染</caption>
  </row>
  <text size="sm">差异只在于「前四段跑在哪里」：iframe 内一整页、Worker 里一整条、或者就在当前组件里。</text>
</box>

## 逐项对比

<grid columns={4} gap={2}>
  <caption>维度</caption><caption>iframe 沙箱</caption><caption>Worker 虚拟树</caption><caption>主线程 AST（现方案）</caption>

  <text size="sm">安全边界</text>
  <text size="sm" color="success">最强：origin + sandbox 隔离</text>
  <text size="sm" color="warning">中：只隔离计算，不回传能力</text>
  <text size="sm" color="warning">中：靠 acorn allowlist 白名单</text>

  <text size="sm">与 React/设计令牌集成</text>
  <text size="sm" color="danger">差：跨 document，主题/CSS 变量/portal 全要重做</text>
  <text size="sm" color="danger">差：不能产出 React 元素</text>
  <text size="sm" color="success">天然：`renderNodes` 直接出组件</text>

  <text size="sm">流式增量</text>
  <text size="sm" color="danger">跨帧 postMessage 协议 + 高度同步，尾部长文本抖动</text>
  <text size="sm" color="warning">需双份 repair 状态，结构化克隆有固定开销</text>
  <text size="sm" color="success">`useThrottledText` 60ms 窗口，尾修复就地完成</text>

  <text size="sm">主线程开销</text>
  <text size="sm" color="success">最低（布局在子帧）</text>
  <text size="sm" color="success">低（但 IPC 反向抵消）</text>
  <text size="sm" color="warning">每窗口一次 parse+eval</text>

  <text size="sm">可调试性</text>
  <text size="sm" color="danger">差：跨 realm 堆栈断裂</text>
  <text size="sm" color="warning">中</text>
  <text size="sm" color="success">好：单栈、可单测</text>

  <text size="sm">可访问性 / 键盘序</text>
  <text size="sm" color="danger">退化</text>
  <text size="sm">—</text>
  <text size="sm" color="success">正常</text>

  <text size="sm">改动成本</text>
  <text size="sm" color="danger">高</text>
  <text size="sm" color="warning">中高</text>
  <text size="sm" color="success">零（已在跑）</text>
</grid>

## 各自的关键取舍

<box gap={2} padding={3} border radius="lg">
  <text weight="semibold">1 · iframe 沙箱</text>
  <row gap={2} align="start">
    <text size="sm" color="success">优势</text>
    <text size="sm">真正的安全隔离；子帧自带布局引擎，overflow/高度/百分比这类空间语义不用自己实现；崩溃不传染主页面。</text>
  </row>
  <row gap={2} align="start">
    <text size="sm" color="danger">代价</text>
    <text size="sm">DIL 的核心价值是「嵌进对话流」，而 iframe 天然是一个外来盒子：主题令牌要注入、高度要 postMessage 回传、选中/复制/滚动锚定/查找全都失效。等于为了隔离放弃组件化。</text>
  </row>
</box>

<box gap={2} padding={3} border radius="lg">
  <text weight="semibold">2 · Web Worker 虚拟树</text>
  <row gap={2} align="start">
    <text size="sm" color="success">优势</text>
    <text size="sm">长文档（数百节点、多层 `{#each}`）下把 parse + 求值 + 差分真正移出主线程；可以顺手做超时熔断，防止病态表达式卡 UI。</text>
  </row>
  <row gap={2} align="start">
    <text size="sm" color="danger">代价</text>
    <text size="sm">Worker 里没有 DOM，虚拟树到 layout 的最后一公里还是得回主线程做；于是每帧多一次结构化克隆 + 一次序列化协议版本负担。流式场景下每次只增量几十个字符，克隆开销往往大于省下的解析时间——收益为负直到文档真的很大。</text>
  </row>
</box>

<box gap={2} padding={3} border radius="lg">
  <text weight="semibold">3 · 主线程 AST 求值（当前）</text>
  <row gap={2} align="start">
    <text size="sm" color="success">优势</text>
    <text size="sm">信任边界收敛在一处（acorn 产物 + `evaluator-allowlist` 的节点白名单），scope、`DIL.useState`、事件回调和 React 状态同住一个世界，流式前缀靠 `__dilSafe` 兜底并可在纯函数单测里验证。</text>
  </row>
  <row gap={2} align="start">
    <text size="sm" color="danger">风险</text>
    <text size="sm">任何一次 parse/eval 都在关键路径上，病态输入（超长表达式、深嵌套 each、大数组 map）会直接卡帧。缓解不靠换架构，靠预算：节点数上限、每窗口单一 snapshot、超限降级为纯 Markdown。</text>
  </row>
</box>

## 选型结论

<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <row align="center" gap={2}><badge>决策</badge><text weight="semibold">保持主线程 AST 求值，不引入 iframe / Worker</text></row>
  <text size="sm">理由排序：① 隔离需求已被 allowlist 覆盖，iframe 买到的是不需要的隔离，付出的是需要的组件化；② Worker 解决的 `parse` 成本目前被 60ms 节流窗口摊薄，而它带来的协议与克隆开销是每帧必付；③ 现方案的失败模式（安静降级）正好匹配流式输出这一主场景。</text>
</box>

何时才值得改：

<grid columns={3} gap={2}>
  <box padding={3} border radius="md" gap={1}>
    <text size="sm" weight="semibold">先加预算，不换架构</text>
    <text size="2xs" color="secondary">panic 指标：单次 parse+eval p95 超过约 8ms，或文档节点数p95 破千。先做节点上限 + 降级。</text>
  </box>
  <box padding={3} border radius="md" gap={1}>
    <text size="sm" weight="semibold">再考虑 Worker</text>
    <text size="2xs" color="secondary">预算做完仍超，且瓶颈确实在 parse 而非渲染：只把 parse+repair 搬进 Worker，求值仍留主线程，避免克隆组件树。</text>
  </box>
  <box padding={3} border radius="md" gap={1}>
    <text size="sm" weight="semibold">iframe 只在一种情况</text>
    <text size="2xs" color="secondary">DIL 要渲染严格不可信的第三方内容（非本模型输出），且可以接受它不参与对话流排版——那更像「预览面板」而非「消息渲染」。</text>
  </box>
</grid>
