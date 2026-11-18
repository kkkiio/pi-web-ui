```js
async function getActiveItems() {
  const res = await fetch('/api/items');
  const items = await res.json();
  return items.filter((item) => item.active);
}
```

一句话解释：把每个 `.then` 的回调改成 `await` 顺序执行，消除了回调链，让代码读起来像同步流程。
