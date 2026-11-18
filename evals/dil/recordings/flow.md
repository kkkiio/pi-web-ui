## 一句话总结

前端把点击操作转成一条 `{type:"req", method:"prompt"}` 的 WebSocket 请求 → `mirror-server` 收到后调用扩展 API `pi.sendUserMessage()`（**仅入队，立即 ack**）→ 真正的执行由 Pi 进程内部 agent loop 完成，执行过程通过 `pi.on(...)` 事件被广播回浏览器。

## 去程：浏览器 → mirror-server → Pi

<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">上行链路（请求）</text>
  <row gap={2} align="center" wrap>
    <badge>1 点击发送</badge><icon name="arrow-right" size="sm"/>
    <badge>2 store.sendPrompt</badge><icon name="arrow-right" size="sm"/>
    <badge>3 PiClient.send</badge><icon name="arrow-right" size="sm"/>
    <badge>4 WS /ws</badge><icon name="arrow-right" size="sm"/>
    <badge>5 handleRequest</badge><icon name="arrow-right" size="sm"/>
    <badge>6 pi.sendUserMessage</badge>
  </row>
</box>

**1. 组件层 — `src/web/src/app.tsx:178-193`**
`submitMessage` 拼接引用文本（`formatQuotedPrompt`）、把附件转成 base64 图片（`processPromptFiles`），然后 `await sendPrompt(...)`。成功后清空草稿与已发送引用；抛错则保留草稿。

**2. Store 层 — `src/web/src/core/store/session-slice.ts:160-182`**
```ts
if (connection !== "connected" || chatStatus === "submitted" || chatStatus === "streaming") → 报错
set({ chatStatus: "submitted" })        // 乐观进入“已提交”态（发送按钮转 loading）
await get().send("prompt", { message, images })
catch → chatStatus: "error" + error.message
```
这是前端唯一的“忙碌”互斥点。

**3. 传输层 — `src/web/src/core/pi-client.ts:93-107`**
构造信封并登记 pending Promise：

| 字段 | 值 |
|---|---|
| `type` | `"req"` |
| `id` | `req-${Date.now()}-${counter}` |
| `method` | `"prompt"` |
| `params` | `{ message, images? }` |

特别注意 `pi-client.ts:95`：`prompt` 在 socket 非 OPEN 时**直接 reject**（不排队），避免“离线时消息静默丢失后又重放”；其它 method 才进 `queuedRequests`。URL 来自 `wsUrl()`：`ws(s)://<location.host>/ws`。

**4. 服务端接入 — `extensions/mirror-server.ts:1004-1035`**
`http.createServer(serveStaticFile)` + `new WebSocketServer({ noServer: true })`；`server.on("upgrade")` 只接受 `request.url === "/ws"`，否则 `socket.destroy()`。连接建立后立刻推两条事件：`webui_state`（是否已 `/webui` 启用高级功能）和 `buildStateSnapshot()` 生成的 `state_sync`（entries/tree/leafId/model/thinkingLevel/contextUsage/liveEvents）。`ws.on("message")` 里做信封校验（`type !== "req" || id/method 非 string` → `{type:"error"}`），再交给 `handleRequest`。

**5. 分发 — `mirror-server.ts:560-597`（`case "prompt"`）**
```ts
const ctx = latestCtx;                    // 最近一次 Pi 回调/命令里缓存的 ExtensionContext
if (!ctx.isIdle() || ctx.hasPendingMessages()) → res.error("Agent is busy...")
images 存在时: [{type:"text", ...}, ...{type:"image", data, mimeType}]
  · data URL 前缀被 split(",") 剥掉
  · mimeType 白名单 png/jpeg/gif/webp，否则回落 image/png
pi.sendUserMessage(带图 ? content : message)
sendTo(ws, success())                     // 立即回 res，不等模型
```
`latestCtx` 由所有 `pi.on(...)` 回调和 `/webui` 命令持续刷新（`mirror-server.ts:374-...`），所以服务端不需要自己持有 agent 实例。

**6. Pi 进程内**
`pi.sendUserMessage()` 属于扩展 API：它把 user message 投递进当前 session 的 agent loop（这就是为什么服务端要先用 `ctx.isIdle()` 挡并发）。之后的一切都在 Pi 进程里发生——组装上下文、调用 provider、流式生成、执行工具、写 session 文件。

## 回程：Pi → mirror-server → 浏览器

mirror-server 在 `eventTypes`（`mirror-server.ts:340-372`）上挂了 `pi.on`，**每个事件都原样广播**：

```
pi.on(eventType) → broadcast({ type: "event", event: eventType, payload })
```
覆盖 `agent_start / agent_end / turn_start / turn_end / message_start / message_update / message_end / tool_execution_{start,update,end} / auto_compaction_* / auto_retry_* / model_select / session_info_changed`，另有单独的 `session_tree` 和 ask-user 的 `pi-web-ui:ask-user:prompt|blocked`（`QUESTION_CHANNEL`）转发。副作用：`tool_execution_start/end` 会维护 `liveToolEvents` Map，用于重连后的 `state_sync.liveEvents` 回放。

浏览器侧 `PiClient.onmessage`（`pi-client.ts:44-68`）按 `data.type` 二分：
- `"res"` → 精确按 `id` 找 pending，`ok` 则 resolve（若 `method === "prompt"` 额外触发 `onPromptResponse` → `markPromptReady()`，把 `submitted` 降为 `ready`，等待真正的事件流接棒），否则 reject。
- `"event"` → `onEvent` → `app.tsx:152` 的 `dispatchPiEvent(usePiWebUiStore.getState(), event)`。

`dispatchPiEvent`（`src/web/src/core/store/event-dispatch.ts`）是纯路由表：

<box gap={1}>
  <row justify="between"><code>agent_start</code><caption>chatStatus = "streaming"</caption></row>
  <row justify="between"><code>message_start</code><caption>user 消息入列 / 建 assistant 流式条目</caption></row>
  <row justify="between"><code>message_update</code><caption>按 delta 类型增量改文字/thinking/工具调用</caption></row>
  <row justify="between"><code>message_end</code><caption>落 usage，条目转 completed</caption></row>
  <row justify="between"><code>tool_execution_*</code><caption>工具卡片 input-streaming → running → done</caption></row>
  <row justify="between"><code>turn_end / session_tree</code><caption>触发 debounce(250ms) 的 <code>sync_request</code> 全量对账</caption></row>
  <row justify="between"><code>agent_end</code><caption>chatStatus = "ready"，清 streamingMessage</caption></row>
</box>

**最终一致性靠 `state_sync`**：`turn_end`、`agent_end`、`auto_compaction_end`、`model_select`、重连/刷新时的 `onOpen`，都会走 `requestConversationSync()` → `sync_request` → 服务端 `buildStateSnapshot()` → `applyStateSync`（`session-slice.ts:90-116`）用权威快照覆盖本地条目树与 usage。流式增量只负责“看起来实时”，`state_sync` 负责“最终正确”。

## 错误与边界路径

<box gap={2} padding={3} border radius="lg">
  <row justify="between"><caption>socket 未连接就发 prompt</caption><text color="danger">PiClient 同步 reject，不进队列</text></row>
  <row justify="between"><caption>agent 忙 / 无 ctx</caption><text color="warning">res.ok=false → sendPrompt catch → chatStatus="error"</text></row>
  <row justify="between"><caption>连接在等待响应时断开</caption><text>所有 pending 被 reject（"Connection lost; reconnect before retrying"），1.2s 后自动重连</text></row>
  <row justify="between"><caption>重连成功</caption><text>重发 <code>webui_state</code> + <code>state_sync</code> + 在途工具事件回放</text></row>
  <row justify="between"><caption>中途打断</caption><text><code>abort</code> → <code>ctx.abort()</code>，随后仍走 agent_end 事件回程</text></row>
</box>

## 两个容易踩的点

1. **`res` 只是入队 ack**：`sendTo(ws, success())` 在 `pi.sendUserMessage()` 之后立即发出，不等待模型输出。所以 `markPromptReady()` 只是把 `submitted` 交还给事件流（`agent_start` 再置 `streaming`），不代表回复已到。
2. **镜像语义是“多客户端广播”**：`broadcast` 发给 `clients` 集合里所有连接，且服务端只认 `latestCtx`（最近一次 Pi 回调的上下文），因此浏览器刷新/多标签页看到的是同一个 Pi 会话，而不是各自独立会话。
