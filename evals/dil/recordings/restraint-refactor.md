```js
async function getActiveItems() {
  const res = await fetch('/api/items');
  const items = await res.json();
  return items.filter((item) => item.active);
}
```

要点：

- 两处 `.then` 各自对应一个 `await`：先等响应，再等 body 解析。
- 原链式调用最终 resolve 的是过滤后的数组，所以 `return` 出来，调用方 `await getActiveItems()` 拿到的结果与原来一致。

如果要在函数内处理错误（原代码没有 `.catch`，错误会冒泡成 unhandled rejection，改成 async 后错误也会冒泡到调用方）：

```js
async function getActiveItems() {
  try {
    const res = await fetch('/api/items');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    return items.filter((item) => item.active);
  } catch (err) {
    console.error('加载 items 失败', err);
    throw err; // 或者 return [];
  }
}
```

另外注意：`res.json()` 解析失败（非 JSON 响应）也会抛异常，这在原 `.then` 版本里同样是 rejection，行为不变。
