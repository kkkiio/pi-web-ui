# Pi Web UI 发送消息：跨进程事件流转

<box padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">一句话总览</text>
  <caption>点击发送 → 浏览器事件 → mirror-server 转发 → Pi 进程执行 → 流式回推 → UI 渲染</caption>
</box>

## 三条进程边界

<grid columns={3} gap={2}>
  <grid-item>
    <box padding={2} background="surface-tertiary" radius="md" border>
      <badge color="secondary">边界 ①</badge>
      <text weight="medium">浏览器 → mirror-server</text>
      <caption>HTTP POST + 后续 SSE 或 WebSocket 长连接</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} background="surface-tertiary" radius="md" border>
      <badge color="warning">边界 ②</badge>
      <text weight="medium">mirror-server → Pi 进程</text>
      <caption>本地子进程通信，通常使用 stdin/stdout 协议</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} background="surface-tertiary" radius="md" border>
      <badge color="success">边界 ③</badge>
      <text weight="medium">Pi 进程 → 外部 provider</text>
      <caption>模型 API 调用，事件再逐层回传</caption>
    </box>
  </grid-item>
</grid>

## 完整流转图

```text
┌──────────────────────────── 浏览器（pi-web-ui） ────────────────────────────┐
│  ① 用户点击"发送"                                                          │
│     └─ useSendMessage / submit handler                                     │
│         └─ 构造 { sessionId, message, model? }                             │
│  ② fetch POST /api/sessions/:id/messages   ─── 边界① ───┐                  │
│                                                          │                  │
│  ⑦ 收到 SSE / WS 事件                                   │                  │
│     └─ 逐条 append 到 message store                      │                  │
│         └─ 渲染气泡 / 打字机效果 / tool call 卡片        │                  │
└──────────────────────────────────────────────────────────┼──────────────────┘
                                                            ▼
┌────────────────────────── mirror-server.ts ────────────────────────────────┐
│  ③ 路由处理：校验 session、取或建 Pi 会话句柄                               │
│  ④ 写入 Pi stdin（JSON 行 / RPC 调用）  ─── 边界② ───┐                     │
│                                                      │                      │
│  ⑥ 读 Pi stdout，转为 SSE/WS 事件                   │                      │
│     └─ 按 type 分派：text_delta / tool_start / done │                      │
│         └─ 通过长连接推回浏览器                     │                      │
└──────────────────────────────────────────────────────┼─────────────────────┘
                                                        ▼
┌──────────────────────────── Pi 进程 ────────────────────────────────────────┐
│  ⑤ 解析指令 → 组装上下文 → 调模型   ─── 边界③ ───┐                         │
│                                                  │                          │
│     模型返回流式 token                          │                          │
│     └─ 逐个 yield 到 stdout（每行一个事件） ◄────┘                          │
│     └─ 期间可能触发 tool 执行，再回填结果                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 去程与回程对照

<row gap={3}>
  <col flex={1}>
    <box padding={2} background="surface" radius="md" border color="secondary">
      <text weight="semibold">去程 ↑</text>
      <divider />
      <text>1. 点击发送</text>
      <text>2. POST 到 mirror-server</text>
      <text>3. 路由 + 会话定位</text>
      <text>4. 写 Pi stdin</text>
      <text>5. Pi 调模型</text>
    </box>
  </col>
  <col flex={1}>
    <box padding={2} background="surface" radius="md" border color="success">
      <text weight="semibold">回程 ↓</text>
      <divider />
      <text>6. Pi stdout 流式事件</text>
      <text>7. mirror-server 转 SSE/WS</text>
      <text>8. 浏览器逐条更新 store</text>
      <text>9. UI 增量渲染</text>
    </box>
  </col>
</row>

## 关键节点速查

<grid columns={2} gap={2}>
  <grid-item>
    <box padding={2} background="surface" radius="md" border>
      <row align="between">
        <text weight="medium">浏览器 → mirror-server</text>
        <badge color="secondary">HTTP</badge>
      </row>
      <caption>请求发一次；回复走 SSE 或 WebSocket 长连接，不用轮询。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} background="surface" radius="md" border>
      <row align="between">
        <text weight="medium">mirror-server → Pi</text>
        <badge color="warning">子进程</badge>
      </row>
      <caption>stdin/stdout 按行或 RPC 交换 JSON 事件，mirror 只做转发和分流。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} background="surface" radius="md" border>
      <row align="between">
        <text weight="medium">Pi → Provider</text>
        <badge color="success">外部 API</badge>
      </row>
      <caption>模型调用，token 流在此产生，是回程事件的源头。</caption>
    </box>
  </grid-item>
  <grid-item>
    <box padding={2} background="surface" radius="md" border>
      <row align="between">
        <text weight="medium">UI 渲染</text>
        <badge color="secondary">增量</badge>
      </row>
      <caption>收到某个 delta 事件就 append，不需要等整条消息结束。</caption>
    </box>
  </grid-item>
</grid>

> 说明：具体函数名（如 `useSendMessage`、`handleSend`）和传输细节会随代码版本略有差异，但**三条进程边界与去程、回程的方向**是稳定的。查看代码时，抓住“POST 请求只用来启动，事件靠长连接回推”这一点，就能定位全链路。
