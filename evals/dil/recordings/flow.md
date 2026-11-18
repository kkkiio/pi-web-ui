## 结论先行

`mirror-server.ts` 不是一个独立进程，它是跑在 Pi 进程内部的 extension，用 `http` + `ws` 在 Pi 进程里开了一个监听端口。所以真正的跨进程边界只有 **3 处**：浏览器渲染进程 ↔ Pi 进程（WebSocket）、Pi 进程内的 extension 宿主 ↔ agent 内核（函数调用）、Pi 进程 ↔ 模型服务商（HTTPS）。

<box gap={3} padding={3} background="surface-secondary" radius="lg">

<title>发送路径（点击 Send → 模型开始推理）</title>

{#each [
 { n: "1", zone: "浏览器进程", at: "#app.tsx:186 · submitMessage", do: "sendPrompt({message, images})", edge: null },
 { n: "2", zone: "浏览器进程", at: "store/session-slice.ts:160", do: "校验 connected / 非 busy → chatStatus=\"submitted\" → send(\"prompt\")", edge: null },
 { n: "3", zone: "浏览器进程", at: "core/store/connection-slice.ts:11 → core/pi-client.ts:send()", do: "生成 req-<ts>-<n>，挂进 pendingRequests，JSON.stringify 后 ws.send()", edge: "WS 帧 /ws" },
 { n: "4", zone: "Pi 进程", at: "mirror-server.ts:1042 ws.on(\"connection\") → ws.on(\"message\")", do: "JSON.parse 校验 type===\"req\" → handleRequest(ws, request)", edge: null },
 { n: "5", zone: "Pi 进程", at: "mirror-server.ts:565 case \"prompt\"", do: "ctx.isIdle() / hasPendingMessages() 双重忙判定；拼接 text+image content block", edge: null },
 { n: "6", zone: "Pi 进程", at: "pi.sendUserMessage(...)", do: "extension 宿主 → agent 内核，入队一轮 turn（非阻塞）", edge: "进程内调用" },
 { n: "7", zone: "Pi 进程", at: "mirror-server.ts:594 sendTo(ws, success())", do: "立即回 ack（注意：这不是最终答案）", edge: "WS 帧 back" },
 { n: "8", zone: "外部网络", at: "agent loop → provider API", do: "HTTPS 流式请求模型", edge: "HTTPS" }
] as s}
  <row gap={2} align="start">
    <badge>{s.n}</badge>
    <col gap={1} flex>
      <row gap={2} align="baseline">
        <text weight="semibold" size="sm">{s.zone}</text>
        {#if s.edge}
          <caption>→ {s.edge}</caption>
        {/if}
      </row>
      <code size="xs">{s.at}</code>
      <text size="sm" color="secondary">{s.do}</text>
    </col>
  </row>
  <divider/>
{/each}

</box>

<box gap={3} padding={3} background="surface-secondary" radius="lg">

<title>返回路径（模型流 → 屏幕）</title>

{#each [
 { n: "1", zone: "外部网络", at: "provider SSE stream", do: "token/增量 + tool_call 流式抵达 agent 内核", edge: "HTTPS" },
 { n: "2", zone: "Pi 进程", at: "agent 内核 emit", do: "agent_start / message_start / message_update / tool_execution_* / message_end / agent_end / turn_end", edge: null },
 { n: "3", zone: "Pi 进程", at: "mirror-server.ts:364 pi.on(eventType)", do: "写 latestCtx、缓存 liveToolEvents（供新连接 replay）→ broadcast({type:\"event\", event, payload})", edge: "WS 帧 broadcast" },
 { n: "4", zone: "浏览器进程", at: "core/pi-client.ts:onmessage", do: "type===\"event\" → onEvent(data)；type===\"res\" → 解挂 pendingRequests", edge: null },
 { n: "5", zone: "浏览器进程", at: "core/store/event-dispatch.ts:dispatchPiEvent", do: "按 event 分发到 applyAgentStart/applyMessageUpdate/... 改 Zustand", edge: null },
 { n: "6", zone: "浏览器进程", at: "React (app.tsx → message-view / DIL renderer)", do: "流式 status=\"streaming\"，增量文本重绘", edge: null }
] as s}
  <row gap={2} align="start">
    <badge>{s.n}</badge>
    <col gap={1} flex>
      <row gap={2} align="baseline">
        <text weight="semibold" size="sm">{s.zone}</text>
        {#if s.edge}
          <caption>→ {s.edge}</caption>
        {/if}
      </row>
      <code size="xs">{s.at}</code>
      <text size="sm" color="secondary">{s.do}</text>
    </col>
  </row>
  <divider/>
{/each}

</box>

## 进程边界一览

<grid columns={3} gap={2}>
  <box padding={2} background="surface-tertiary" radius="md" gap={1}>
    <row gap={1} align="center"><icon name="monitor" size="sm"/><text weight="semibold" size="sm">浏览器进程</text></row>
    <caption>React + Zustand + PiClient</caption>
    <caption color="secondary">app.tsx · session-slice · pi-client · event-dispatch</caption>
  </box>
  <box padding={2} background="surface-tertiary" radius="md" gap={1}>
    <row gap={1} align="center"><icon name="server" size="sm"/><text weight="semibold" size="sm">Pi 进程</text></row>
    <caption>extension 宿主(HTTP+WS) + agent 内核</caption>
    <caption color="secondary">mirror-server.ts 与 agent 同进程，只有函数调用边界</caption>
  </box>
  <box padding={2} background="surface-tertiary" radius="md" gap={1}>
    <row gap={1} align="center"><icon name="cloud" size="sm"/><text weight="semibold" size="sm">模型服务商</text></row>
    <caption>HTTPS 流式</caption>
    <caption color="secondary">只有 agent 内核直连，浏览器永不直连</caption>
  </box>
</grid>

## 三个容易踩的语义点

- **ack ≠ 完成**：`case "prompt"` 在 `pi.sendUserMessage()` 之后立刻 `success()` 回包，前端 `sendPrompt` await 的是"已入队"，真正的回答要靠后续 `agent_start`/`message_update` 事件。
- **双端都做忙判定**：前端 `chatStatus` 挡一次（`session-slice.ts:162`），服务端再挡一次 `!ctx.isIdle() || ctx.hasPendingMessages()`（`mirror-server.ts:570`）——防止多标签页/多客户端并发抢同一 agent。
- **断线不重放**：`pi-client.ts:onclose` 把所有 pending 和 queued 全部 reject/清空，只有非 `prompt` 的幂等请求才会走 `queuedRequests` 排队重发逻辑。
