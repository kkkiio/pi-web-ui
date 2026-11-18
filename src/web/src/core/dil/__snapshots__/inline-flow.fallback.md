**结论：**先把 `max_connections` 调回默认值，再观察 **2 个采样窗口**。

公式 $Q = \lambda W$ 说明排队长度只与到达率和停留时间有关。

详见 [Postgres 文档](https://www.postgresql.org/docs "连接与并发")，以及 ~~旧版调参笔记~~。
