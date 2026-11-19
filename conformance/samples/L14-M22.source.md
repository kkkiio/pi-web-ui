你的理解基本准确，而且你提出的网络分区问题，恰好触及了 **Durable Objects 设计里最关键的一致性边界**。

## 1. 你想起来的微软框架叫 Orleans

全名是 <Entity category="software" value="Microsoft Orleans" disambig="微软 .NET Virtual Actor 分布式框架"/>。

它的核心抽象叫 **Virtual Actor**，具体实例叫 Grain。

微软从 2010 年开始研究 Orleans，后来用于 Halo 系列游戏的云端服务。<Cite ref="turn590424search3"/>

它与 Durable Objects 的核心思想几乎一致：

- Actor 有稳定的逻辑身份。
- Runtime 自动管理激活、休眠、故障恢复。
- 每个 Actor 独立管理自己的状态。
- 大量 Actor 分布在不同机器上运行。

不过有个区别：Orleans 更偏向通用分布式 Actor 框架，支持多种状态存储方案；Durable Objects 把私有持久化存储直接纳入核心编程模型。

## 2. 对象存储现在真的支持强一致 CAS？

**是的，但并不是所有对象存储都支持。**

几个典型例子：

| 服务 | 条件写入机制 |
|---|---|
| Amazon S3 | `If-Match` / `If-None-Match` |
| Cloudflare R2 | ETag 条件写入 |
| Google Cloud Storage | Generation Preconditions |
| Azure Blob | ETag + 条件请求 |

例如 S3：

```text
读取 owner.json
得到 ETag = abc123

PUT owner.json
If-Match: abc123
Body: { "owner": "Node-B" }
```

如果 Node A 已经修改了这个对象，Node B 的请求就会失败。

这是存储服务原子执行的条件写入，而不是客户端先检查再覆盖，因此可以用于实现 CAS。<Cite refs={["turn767889search2","turn767889search4","turn767889view0"]}/>

不过，一个容易忽略的地方是：**强一致读写不等于支持 CAS**，而兼容 S3 API 也不代表完整实现了相关条件写入语义。

celld 官方就明确排除了部分对象存储实现，并提供了条件写入测试。

