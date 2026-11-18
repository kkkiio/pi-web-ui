```js
async function getActiveItems() {
  const res = await fetch('/api/items');
  const items = await res.json();
  return items.filter((item) => item.active);
}
```

把链式的两个 `.then` 拆成顺序的 `await`（`fetch` 和 `res.json()` 各一次），用 `return` 代替最后一个 `.then` 的返回值，因此必须包在 `async` 函数里——原来 `fetch(...).then(...)` 直接返回的 Promise 现在由这个 `async` 函数返回。
