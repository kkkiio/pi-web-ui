这里的 `output_dims` 是 **输出 Tensor 的形状（shape）**，也就是把输入 `x` 的最后一个维度去掉。

关键代码：

```python
D, output_dims = x.shape[-1], x.shape[:-1]
y = torch.empty(output_dims, device=x.device)
```

假设输入：

```python
x.shape      = (4, 128, 256)
weight.shape = (256,)
```

那么：

- `D = 256`
- `output_dims = (4, 128)`
- **`y.shape = (4, 128)`**
- `y.numel() = 4 * 128 = 512`

### 为什么要去掉最后一个维度？

因为这里实现的是沿最后一个维度的加权求和（weighted sum）：

\[
y_{i,j}=\sum_{k=0}^{255}x_{i,j,k}\cdot w_k
\]

<box border radius="lg" padding={3} gap={2}>
  <svg viewBox="0 0 330 165" width="100%" xmlns="http://www.w3.org/2000/svg">
    <text x="73" y="16" textAnchor="middle" fill="currentColor" fontSize="12">x: [4, 128, 256]</text>
    {#each Array.from({length:4},(_,i)=>i) as layer}
      <rect x={22+layer*11} y={49-layer*9} width="110" height="68" rx="3" fill="#5188d8" fillOpacity={0.12+layer*0.12} stroke="#5188d8" strokeWidth="1.5"/>
    {/each}
    <text x="82" y="138" textAnchor="middle" fill="currentColor" fontSize="11">输入张量</text>
    <path d="M155 77 H204" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M197 72 L204 77 L197 82" stroke="currentColor" fill="none" strokeWidth="1.5"/>
    <text x="181" y="60" fontSize="10" textAnchor="middle" fill="currentColor">Σ x·w</text>
    <text x="268" y="16" textAnchor="middle" fill="currentColor" fontSize="12">y: [4, 128]</text>
    <rect x="232" y="35" width="75" height="85" rx="3" fill="#30a47a" fillOpacity="0.12" stroke="#30a47a" strokeWidth="1.5"/>
    {#each Array.from({length:4},(_,i)=>i) as i}
      <line x1={232+(i+1)*15} y1="35" x2={232+(i+1)*15} y2="120" stroke="#30a47a" strokeOpacity=".4"/>
    {/each}
    {#each Array.from({length:4},(_,i)=>i) as i}
      <line x1="232" y1={35+(i+1)*17} x2="307" y2={35+(i+1)*17} stroke="#30a47a" strokeOpacity=".4"/>
    {/each}
    <text x="270" y="138" textAnchor="middle" fontSize="11" fill="currentColor">输出张量</text>
  </svg>
  <caption textAlign="center">每 256 个输入元素加权求和，得到一个输出标量。</caption>
</box>

### Triton kernel 中的形状

代码：

```python
x = rearrange(x, "... d -> (...) d")
```

将 `x` 从 `(4, 128, 256)` 展平为 `(512, 256)`。

因此：

| 变量 | 值 |
|---|---|
| `x.shape`（展平后） | `(512, 256)` |
| `weight.shape` | `(256,)` |
| `y.shape` | `(4, 128)` |
| `n_rows = y.numel()` | `512` |

虽然 `y` 的形状是 `(4, 128)`，但 Triton kernel 使用线性地址依次写入 512 个元素，因此不需要把它变成 `(512,)`。

最后：

```python
return y.view(input_shape[:-1])
```

只是再次确保输出形状是 `(4, 128)`。在当前实现中，**这个 `view()` 实际上是多余的**，因为 `y` 创建时就已经具有正确的形状。