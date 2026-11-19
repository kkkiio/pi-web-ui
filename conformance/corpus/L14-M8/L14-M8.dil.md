**Durable Objects 是我觉得近几年 Serverless 架构里非常值得理解的一个设计。** 它的价值不只是“让 Serverless 能保存状态”，而是提供了一种更简单的构建分布式系统的方式。

先说最核心的结论：

> **Durable Object = 一个有固定身份、能记住状态、拥有私有数据库、并且同一时刻只有一个活动执行实例的小型服务器。**

你可以把它理解为：**每一个用户、聊天室、游戏房间，甚至 AI Agent，都可以拥有一个属于自己的小服务器。**

而且这个服务器：
- 不需要你自己管理生命周期。
- 没人使用时可以休眠。
- 下次请求来了自动唤醒。
- 机器故障后可以在别的机器恢复。
- 有自己的持久化存储。
- 同一个对象的状态修改有明确的协调点，不必自己处理分布式多写者冲突。

Cloudflare 把这个模型做成了托管服务；而你提到的 <Entity category="software" value="celld" disambig="开源自托管分布式 Durable Objects 运行时"/>，则尝试让它运行在你自己的服务器上。<Cite refs={["turn513616search0","turn513616search3","turn513616search4"]}/>

这里还有一个刚发生的消息：**2026 年 10 月 9 日，Deno 宣布整个团队加入 Cloudflare，双方将合并 `workerd` 和 `celld` 的相关工作。** 目标是让相同的 Workers / Durable Objects 编程模型既能在 Cloudflare 上运行，也能自托管。<Cite refs={["turn513616search7","turn340484search0"]}/>

## 一、为什么要发明 Durable Objects？

先理解传统 Serverless 的一个核心问题。

假设你用 Cloudflare Workers 实现一个在线多人游戏。

<box border radius="xl" padding={3} gap={2}>
  <text weight="medium" size="sm">传统 Serverless：计算无状态，状态存放在外部数据库</text>
  <svg viewBox="0 0 340 188" width="100%" xmlns="http://www.w3.org/2000/svg">
    {#each [0,1,2] as i}
      <rect x={14+i*116} y="8" width="80" height="28" rx="8" fill="#64748b" fillOpacity=".15" stroke="#94a3b8"/>
      <text x={54+i*116} y="26" fontSize="11" textAnchor="middle" fill="currentColor">玩家 {["A","B","C"][i]}</text>
      <path d={`M${54+i*116} 36 V54`} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow1)"/>
      <rect x={14+i*116} y="57" width="80" height="34" rx="7" stroke="#64748b" fill="#64748b" fillOpacity=".12"/>
      <text x={54+i*116} y="78" fontSize="11" textAnchor="middle" fill="currentColor">Worker</text>
      <path d={`M${54+i*116} 91 V111 L170 131`} stroke="#94a3b8" strokeWidth="1.4" fill="none"/>
    {/each}
    <rect x="79" y="132" width="182" height="45" rx="9" fill="#0d9488" fillOpacity=".13" stroke="#0d9488" strokeWidth="1.5"/>
    <text x="170" y="151" fontSize="12" fontWeight="600" textAnchor="middle" fill="currentColor">共享数据库</text>
    <text x="170" y="166" fontSize="10" textAnchor="middle" fill="currentColor">协调、事务、冲突处理</text>
    <defs><marker id="arrow1" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#94a3b8"/></marker></defs>
  </svg>
  <caption>三个请求可能被不同地区的 Worker 处理，Worker 本身不共享可靠的持久状态。</caption>
</box>

假设一间游戏房间里有 3 个人，同时操作一个物品：

1. 玩家 A 请求：拿起物品。
2. 玩家 B 请求：拿起同一个物品。
3. 玩家 C 请求：查询物品现在属于谁。

这些请求可能到达三个不同的 Worker。

如果它们都读取数据库里的 `owner = null`，那么 A 和 B 都可能认为自己成功了。

当然，你可以用数据库事务、乐观锁、Redis Lua、分布式锁来解决。

但随着系统越来越复杂，你还会遇到：
- 如何广播房间状态给所有玩家？
- 如何保持房间的内存缓存一致？
- 如何处理 WebSocket 连接？
- 如何保证定时任务只执行一次？
- 如何为成千上万个独立房间扩容？

**Durable Objects 的想法是：既然这些请求都围绕同一个业务实体，为什么不让它们直接交给同一个状态管理者？**

## 二、Durable Objects 的设计思想

<box border radius="xl" padding={3} gap={2}>
  <text weight="medium" size="sm">Durable Objects：按业务实体组织计算与状态</text>
  <svg viewBox="0 0 340 198" width="100%" xmlns="http://www.w3.org/2000/svg">
    {#each [0,1,2] as i}
      <rect x={14+i*116} y="8" width="80" height="28" rx="8" fill="#64748b" fillOpacity=".15" stroke="#94a3b8"/>
      <text x={54+i*116} y="26" fontSize="11" textAnchor="middle" fill="currentColor">玩家 {["A","B","C"][i]}</text>
      <path d={`M${54+i*116} 36 V53 L170 71`} stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    {/each}
    <rect x="52" y="72" width="236" height="116" rx="12" fill="#0d9488" fillOpacity=".07" stroke="#0d9488" strokeWidth="1.8"/>
    <text x="170" y="92" fontWeight="600" fontSize="12" textAnchor="middle" fill="currentColor">Room-123 Durable Object</text>
    <rect x="67" y="104" width="99" height="62" rx="8" stroke="#0d9488" fill="#0d9488" fillOpacity=".12"/>
    <text x="116" y="127" textAnchor="middle" fontSize="11" fill="currentColor">单线程逻辑</text>
    <text x="116" y="143" textAnchor="middle" fontSize="10" fill="currentColor">当前房间状态</text>
    <rect x="175" y="104" width="97" height="62" rx="8" stroke="#0d9488" fill="#0d9488" fillOpacity=".12"/>
    <text x="223" y="127" textAnchor="middle" fontSize="11" fill="currentColor">私有 SQLite</text>
    <text x="223" y="143" textAnchor="middle" fontSize="10" fill="currentColor">持久保存</text>
    <path d="M166 135 H175" stroke="#0d9488" strokeWidth="1.5"/>
    <text x="170" y="179" fontSize="9" textAnchor="middle" fill="currentColor">同一个 Room ID 始终路由到同一个逻辑对象</text>
  </svg>
</box>

它背后有四个非常重要的设计原则。

**1. Identity（固定身份）**

每个 Durable Object 都有独立的 ID。例如 `room-123` 无论从哪里请求，最终都能找到对应的逻辑对象。

**2. Single Writer（单写者）**

每个对象只有一个活动实例负责维护自己的状态。这把很多跨机器的并发协调，转化为了单个对象内部的操作。

注意：单线程并不代表所有异步请求都严格排队执行。`await` 仍可能让请求交错，Cloudflare 使用存储事务和 input/output gates 保护关键操作。跨外部服务的逻辑依然需要考虑并发。

**3. Colocated Compute + Storage（计算与存储绑定）**

一个 Durable Object 不只是程序代码，它还拥有私有的持久化存储。现代 Cloudflare DO 推荐使用 SQLite。

这意味着执行逻辑和访问状态可以非常靠近，而不是每次都去访问远程数据库。

**4. Scale by Objects（按对象水平扩容）**

不是把同一个房间分散到 10 台机器并让它们争夺写入权，而是：

- `room-123` 在机器 A。
- `room-456` 在机器 B。
- `room-789` 在机器 C。

系统通过增加不同的对象来实现整体扩容，而不是让一个对象无限扩容。<Cite refs={["turn513616search0","turn513616search8","turn340484search11","turn513616search9"]}/>

这实际上非常接近经典的 **Actor Model（Actor 模型）**：每个 Actor 拥有自己的状态，通过接收消息来工作，尽量避免跨 Actor 共享可变内存。

