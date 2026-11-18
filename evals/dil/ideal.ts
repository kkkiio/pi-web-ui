/**
 * Hand-written "ideal" answers, one per case.
 *
 * They exist so the scorer can be tested without a model: each answer must pass every
 * check of its case, which keeps the checks both satisfiable and discriminating. They
 * also read as examples of the shape each prompt is asking for.
 */

export const IDEAL_ANSWERS: Record<string, string> = {
  flow: `浏览器的主线程发起请求后，消息会跨两个进程边界，再原路返回。

<box border radius="lg" padding={3}>
  <row align="center" gap={2}>
    <badge color="info">浏览器</badge>
    <icon name="arrow-down"/>
    <badge color="warning">Pi 进程</badge>
  </row>
  <box background="surface-secondary" padding={2}>
    <text size="sm">chat-input.tsx</text>
    <row align="center" gap={1}><icon name="arrow-down"/><code>ws.send({ type: "send" })</code></row>
  </box>
  <box background="surface-tertiary" padding={2}>
    <text size="sm">mirror-server.ts 收到 ws 消息，调用 pi.send()</text>
  </box>
  <box padding={2}>
    <text size="sm">Pi 进程处理完，事件经 mirror-server 回推 WebSocket</text>
  </box>
</box>`,
  comparison: `三种方案各有取舍：

<grid columns={3} gap={2}>
  <box border padding={2}><badge color="success">隔离最好</badge><text>iframe 沙箱</text></box>
  <box border padding={2}><badge color="warning">折中</badge><text>Web Worker 虚拟树</text></box>
  <box border padding={2}><badge color="danger">最快</badge><text>主线程 AST 求值</text></box>
</grid>

- 安全边界最清楚的是 iframe
- 主线程求值延迟最低，但要自己做补丁

<box background="surface-secondary" padding={3}><bold>结论：</bold>主线程求值 + 白名单。</box>`,
  proportions: `128k 上下文里，File Reads 已经吃掉接近一半，先砍它最快。

<box gap={2}>
  {#each [{ label: "System Prompt", p: 12 }, { label: "Tool Definitions", p: 28 }, { label: "File Reads", p: 45 }, { label: "Conversation", p: 15 }] as item}
    <row justify="between" align="center" gap={2}>
      <text size="sm">{item.label}</text>
      <text size="sm" tabularNums>{item.p}%</text>
    </row>
    <box background="surface-tertiary" radius="full" height="10px">
      <box background="surface" radius="full" height="100%" width={\`\${item.p}%\`}/>
    </box>
  {/each}
</box>

建议把 File Reads 换成按需检索。`,
  states: `Git 工作区有五个主要状态：

{#each [{ state: "Untracked", cmd: "git add" }, { state: "Staged", cmd: "git commit" }, { state: "Modified", cmd: "git diff" }, { state: "Committed", cmd: "git push" }, { state: "Pushed", cmd: "git revert" }] as item}
  <grid columns={2} gap={2}>
    <box border padding={2}><text weight="medium">{item.state}</text></box>
    <code>{item.cmd}</code>
  </grid>
{/each}

<badge color="success">可逆：Staged → Untracked</badge>`,
  restraint: `改好了：

\`\`\`js
const res = await fetch("/api/items");
const items = await res.json();
const active = items.filter((item) => item.active);
\`\`\`

改成 await 后去掉了嵌套回调。`,
};
