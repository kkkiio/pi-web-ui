```js
const res = await fetch('/api/items');
const items = await res.json();
const activeItems = items.filter((item) => item.active);
```

每个 `.then` 回调里“被 Promise 传递”的中间值变成一条 `await` 赋值语句，这种线性写法读起来就是普通同步代码，错误处理直接交给外层 `try/catch` 或调用方的 `catch`。
