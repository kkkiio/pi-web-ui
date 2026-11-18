<box gap={3} padding={3} background="surface-secondary" radius="lg">
  <row justify="between" align="center">
    <text weight="semibold" size="lg">选型结论</text>
    <badge>main decision</badge>
  </row>
  <text>维持现状：<bold>主线程 AST 求值</bold>。iframe 与 Worker 都不是渲染问题，而是把问题搬到别处，并且都要付与设计系统断联的代价。</text>
  <row gap={2} align="center">
    <icon name="check-circle" size="sm"/>
    <caption>现有实现即第三种：parseDocument → evaluateStatements → resolveNodes → React（src/components/dil/dil-renderer.tsx）</caption>
  </row>
</box>

## 对比矩阵

| 维度 | iframe 沙箱 | Web Worker 虚拟树 | 主线程 AST 求值（现状） |
|---|---|---|---|
| 安全隔离 | 强（跨源 + CSP） | 弱（仅隔离线程） | 依赖 allowlist，无隔离 |
| 每 tick 成本 | postMessage 全量 HTML/树 + 重排 | 结构化克隆整棵 AST + 双份内存 | 直接 React 复用，零序列化 |
| 流式更新 | 需在 iframe 内重建或 diff | 需在主线程重建树 | 节流 60 ms 全量重解析 |
| 设计系统一致性 | 需复制 Tailwind/shadcn/KaTeX/Shiki | 无影响（仅算树） | 原生复用 |
| 交互能力 | 跨边界传事件，`useState` 需代理 | 无 DOM，回调寄回主线程 | 直接是 React state |
| 高度/滚动/选中/查找 | 需 ResizeObserver 自适应高度，Cmd+F 失效 | 无影响 | 天然正确 |
| 调试成本 | 高（两套上下文） | 中（消息协议） | 低（单调用栈） |
| 改动量 | 全量重写 | 中 | 0 |

## 逐项展开

<box gap={2} padding={3} background="surface" radius="md" border={{size: 1, color: "danger"}}>
  <row gap={2} align="center">
    <icon name="shield" size="sm"/>
    <text weight="semibold">iframe 沙箱 — 用错了工具</text>
  </row>
  <text>它防的是「执行任意 HTML/JS」。但 DIL 不是 HTML：求值器是纯函数式白名单（`evaluator-allowlist.ts`），没有 <code>eval</code> / <code>new Function</code>、无原型链、无赋值、无 DOM、无网络，字符串长度与 <code>Array.from</code> 上限硬编码。<caption>攻击面比「沙箱化一段用户 HTML」小一个数量级。</caption></text>
  <col gap={1}>
    <text color="secondary">代价却是全量的：设计 token 只能靠注入 CSS 变量勉强同步；自动高度、文本选中、页内查找、无障碍朗读、复制粘贴全部退化；KaTeX/Shiki 要么在 iframe 里再装一遍，要么退化成纯文本。</text>
    <text color="secondary">而且 <code>sandbox</code> 只有取舍：加 <code>allow-same-origin</code> 就失去隔离，不加就难共享样式。</text>
  </col>
</box>

<box gap={2} padding={3} background="surface" radius="md" border={{size: 1, color: "warning"}}>
  <row gap={2} align="center">
    <icon name="cpu" size="sm"/>
    <text weight="semibold">Web Worker 虚拟树 — 优化了不存在的瓶颈</text>
  </row>
  <text>Worker 不能跑 React DOM，所以它只能产出<bold>虚拟树</bold>再由主线程渲染。每 tick 就要把一棵全新的 AST 结构化克隆过来 —— 每一次 parse 都产生新对象，无法增量传递。</text>
  <box gap={1} padding={2} background="surface-tertiary" radius="sm" tabularNums>
    <row justify="between"><caption>parseDocument 全量</caption><text>≈ 1 ms</text></row>
    <row justify="between"><caption>60 ms 节流窗口占比</caption><text>≈ 1.7%</text></row>
    <row justify="between"><caption>postMessage 克隆 + 重建</caption><text>同量级或更高</text></row>
  </box>
  <caption>仓库 README 已测得 parse 约 1 ms（corpus fixtures / Node）。花一次跨线程拷贝去省 1 ms 的同步执行，净收益接近零，还多出一条消息协议和双份内存。</caption>
  <text>唯一真正受益的场景：单条消息体积异常大（数万节点）或低端设备主线程被 Shiki 高亮挤占 —— 而后者用 <code>React.memo</code> + 「闭合后才高亮」已经解决。</text>
</box>

<box gap={2} padding={3} background="surface" radius="md" border={{size: 1, color: "success"}}>
  <row gap={2} align="center">
    <icon name="check-circle" size="sm"/>
    <text weight="semibold">主线程 AST 求值 — 唯一能保持「DOM 与设计系统同一份」的方案</text>
  </row>
  <col gap={1}>
    <text>零序列化：解析、求值、展开控制在一次同步调用栈内，错误按节点降级（一个坏表达式不带走兄弟节点）。</text>
    <text>可用的缓存模型极简：节流即全部缓存，纯函数 parse 保证永不渲染陈旧树，丢帧也不会与正文分叉。</text>
    <text>安全边界落在求值器而非进程：风险从「任意代码执行」降级为「求值器有 bug」，这是可审计、可单测（Node 无依赖跑）的边界。</text>
  </col>
  <caption>代价诚实记录：解析与求值占用主线程；恶意输入可构造大文档造成单帧卡顿。用体积上限与节流兜底，而不是上沙箱。</caption>
</box>

## 落地建议

<grid columns={2} gap={2}>
  <grid-item>
    <box gap={1} padding={3} background="surface" radius="md" border>
      <text weight="semibold" size="sm">现在做</text>
      <text size="sm">保持主线程方案不变；为单条消息节点数/字符数加上限，超出即降级为 Markdown fallback。</text>
    </box>
  </grid-item>
  <grid-item>
    <box gap={1} padding={3} background="surface" radius="md" border>
      <text weight="semibold" size="sm">暂不做</text>
      <text size="sm">不引入 Worker、不引入 iframe；不为「理论上更安全」牺牲查找、选中、主题与无障碍。</text>
    </box>
  </grid-item>
</grid>

<divider/>

<box gap={2} padding={3} background="surface-secondary" radius="md">
  <row gap={2} align="center">
    <icon name="refresh-cw" size="sm"/>
    <text weight="semibold" size="sm">重新评估的触发条件</text>
  </row>
  {#each ["DIL 未来引入任意表达式/自定义组件/外链资源", "需要渲染他人提供的不可信 DIL（多租户/分享链接）", "实测单帧 parse 超过 8 ms 或长任务告警出现", "需要 DIL 内执行副作用（fetch、跳转、持久化）"] as trigger, i}
    <row gap={2} align="start">
      <badge>{i + 1}</badge>
      <text size="sm">{trigger}</text>
    </row>
  {/each}
  <caption>命中第 1/2/4 条才考虑 iframe；只命中第 3 条才考虑 Worker，且应优先做「大文档分片渲染」而不是搬线程。</caption>
</box>
