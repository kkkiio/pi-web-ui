<box gap={3}>

<title>三种 DIL 渲染方案对比</title>

<text>用户写的标签像 <code>{#each}</code>、<code>{expr}</code>，本质是“模板 + 表达式求值 + 转成 DOM”。差别只在<bold>在哪求值</bold>和<bold>如何落地</bold>。</text>

<grid columns={3} gap={3}>

<grid-item background="surface-secondary" radius="md" padding={3}>
<row align="between" gap={2}>
<title size="sm">① iframe 沙箱</title>
<badge color="warning">隔离强</badge>
</row>
<text size="sm">每个渲染单元放进 <code>srcdoc</code> iframe，脚本在独立 origin/realm 跑，DOM 直接在内层长出。</text>
<caption>适合：不可信内容、多租户</caption>
</grid-item>

<grid-item background="surface-secondary" radius="md" padding={3}>
<row align="between" gap={2}>
<title size="sm">② Worker 虚拟树</title>
<badge color="warning">无阻塞</badge>
</row>
<text size="sm">Worker 里求值成虚拟树，postMessage 回主线程，主线程只做 diff 打补丁。</text>
<caption>适合：大列表、重计算</caption>
</grid-item>

<grid-item background="surface-secondary" radius="md" padding={3}>
<row align="between" gap={2}>
<title size="sm">③ 主线程 AST 求值</title>
<badge color="success">最简单</badge>
</row>
<text size="sm">Markdown 解析成 AST，直接解释执行生成 DOM，不跨线程不跨 realm。</text>
<caption>适合：自产内容、首版</caption>
</grid-item>

</grid>

<divider />

<grid columns={3} gap={3}>

<grid-item>
<title size="sm">① iframe 沙箱</title>
<box gap={1}>
<text size="sm"><bold color="success">优</bold> 同源策略天然兜底，脚本无法碰宿主 DOM/存储；崩溃互不影响；实现心智简单（写页面即可）。</text>
<text size="sm"><bold color="danger">劣</bold> 每个实例一套文档与脚本上下文，内存/启动开销大；样式无法继承，主题要二次注入；高度自适应靠 ResizeObserver + 握手，滚动、弹层、焦点、无障碍全部跨边界失真。</text>
</box>
</grid-item>

<grid-item>
<title size="sm">② Worker 虚拟树</title>
<box gap={1}>
<text size="sm"><bold color="success">优</bold> 求值不占主线程，大 <code>#each</code> 不卡输入；纯数据通信，可结构化克隆/可转移对象；天然支持算完再合并批量更新。</text>
<text size="sm"><bold color="danger">劣</bold> 没有 DOM，只能产出虚拟树，等于自建一套 diff/patch；事件与状态要往返序列化，交互延迟多一跳；Worker 里没有 <code>document</code>，样式计算、测量类能力缺失，调试链路长。</text>
</box>
</grid-item>

<grid-item>
<title size="sm">③ 主线程 AST 求值</title>
<box gap={1}>
<text size="sm"><bold color="success">优</bold> 零跨域成本，样式继承、事件、焦点、滚动、无障碍全正常；代码量最小，调试栈直白；与现有组件库直接互操作。</text>
<text size="sm"><bold color="danger">劣</bold> 求值即阻塞，表达式写坏（大循环、深递归）会冻 UI；没有隔离，恶意/错误表达式直接改宿主；只能靠白名单解释器 + 超时防护补。</text>
</box>
</grid-item>

</grid>

<divider />

<row align="between">
<text weight="semibold">典型成本量级</text>
<caption>相对值，用于排序而非绝对值</caption>
</row>

<grid columns={4} gap={2}>
<text size="sm" color="secondary">维度</text>
<text size="sm" color="secondary">iframe</text>
<text size="sm" color="secondary">Worker</text>
<text size="sm" color="secondary">主线程 AST</text>

<text size="sm">首屏启动</text><badge>高</badge><badge>中</badge><badge color="success">低</badge>
<text size="sm">单实例内存</text><badge>高</badge><badge>中</badge><badge color="success">低</badge>
<text size="sm">主线程卡顿风险</text><badge color="success">无</badge><badge color="success">无</badge><badge color="danger">有</badge>
<text size="sm">样式/交互还原</text><badge color="danger">差</badge><badge>中</badge><badge color="success">好</badge>
<text size="sm">实现工作量</text><badge>中</badge><badge color="danger">高</badge><badge color="success">低</badge>
</grid>

<divider />

<box gap={2} background="surface-tertiary" radius="md" padding={3}>
<title size="sm">选型结论</title>
<text size="sm"><bold>主方案走 ③ 主线程 AST 求值</bold>：解释器只接受白名单语法子集，求值前做节点数与循环上限、执行时长软超时，异常降级为纯文本。这是唯一能保住样式继承、事件与无障碍的路径，也最省工。</text>
<text size="sm"><bold>② Worker 不进 v1</bold>，留作后续优化：仅当出现“超长 <code>#each</code> 导致掉帧”的实测数据时，把纯计算部分（表达式求值、列表映射）下沉到 Worker，diff 仍留主线程——即 ③ 的性能补丁，而非替代架构。</text>
<text size="sm"><bold>① iframe 只在明确需要不可信输入时启用</bold>（如分享/嵌入第三方生成内容），作为可选“隔离档”，并接受其样式与交互损失。</text>
</box>

<caption>一句话：默认 ③，安全场景按需切 ①，性能告急时给 ③ 加 ② 的计算旁路。三者是分层选项，不是互斥替代。</caption>

</box>
