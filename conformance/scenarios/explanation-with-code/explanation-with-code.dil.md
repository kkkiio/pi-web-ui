## 二、最接近你设想的成熟方案：OCaml 的 `.mli`

如果只推荐一种语言作为设计参考，我会选 <Entity category="software" value="OCaml" disambig="函数式编程语言"/>。

OCaml 长期使用两种文件：

<box border radius="lg" padding={3} gap={3}>
  <row align="center" gap={2}>
    <box background="surface-secondary" radius="md" padding={2}>
      <icon name="file-text" size="lg"/>
    </box>
    <box flex="1" gap="1px">
      **`pricing.mli` — 人工维护的契约**

      <text color="secondary" size="sm">函数签名、抽象类型、文档注释、对外暴露的成员</text>
    </box>
  </row>
  <row justify="center" align="center">
    <icon name="arrow-down" color="secondary"/>
    <text color="secondary" size="xs">编译器检查兼容性</text>
  </row>
  <row align="center" gap={2}>
    <box background="surface-secondary" radius="md" padding={2}>
      <icon name="file-code" size="lg"/>
    </box>
    <box flex="1" gap="1px">
      **`pricing.ml` — 实现代码**

      <text color="secondary" size="sm">算法、防御性检查、辅助函数、缓存及其他内部细节</text>
    </box>
  </row>
</box>

例如人工编写的 `pricing.mli`：

```ocaml
(** 对订单应用折扣。

    折扣不得大于原价。
    合法输入的结果始终非负。
    无效折扣返回 Error。
*)
val apply_discount :
  price:int ->
  discount:int ->
  (int, string) result
```

对应的 `pricing.ml` 则包含具体实现，可以由 AI 编写。

这里有几个很重要的特性：

1. `.mli` 是可以人工维护的源码，不是只能自动生成的产物。
2. 文档注释可以直接写在 `.mli` 中，并用于生成 API 文档。
3. 编译器会检查 `.ml` 的公开实现是否满足 `.mli`。
4. 实现中没有暴露在 `.mli` 里的辅助函数，可以对外隐藏。

OCaml 甚至允许先从实现推导出接口，再人工修改、精简；也可以反过来先写接口，之后补充实现。官方文档专门讨论了这两种开发顺序。<Cite refs={["turn583220search1","turn125748search0"]}/>

唯一需要注意的是：**OCaml 的基本配对单位是 module，不是整个项目。** 通常一个 `foo.mli` 对应一个 `foo.ml`。如果希望把多个子模块集中暴露在统一接口中，可以通过顶层模块签名来组织，但不是把任意文件中的函数直接汇总就可以了。

### 其他语言的方案

| 语言 | 声明与实现分离 | 适合你的程度 |
|---|---|---|
| **OCaml** `.mli` / `.ml` | 编译器检查，支持文档注释 | 很高 |
| **Ada / SPARK** spec / body | 支持前置、后置条件，甚至形式化验证 | 很高 |
| **F#** `.fsi` / `.fs` | 真正的签名文件，编译器检查 | 高 |
| **C / C++** `.h` / `.cpp` | 经典声明与实现分离 | 中高 |
| **Python** `.pyi` / `.py` | 方便集中阅读类型，需额外同步检查 | 中 |
| **TypeScript** `.d.ts` | 主要描述库的类型接口，不保证 JS 实现满足行为契约 | 中 |

其中两种值得展开：

**F# 的 `.fsi`** 也非常符合你的设想。编译器可以生成初始签名文件，然后开发者人工删除不需要暴露的成员。不过通常一个 `.fsi` 对应一个 `.fs`，不像 MoonBit 同一个 package 中多个 `.mbt` 共享作用域那样自由。<Cite ref="turn125748search1"/>

**Python 的 `.pyi`** 可以和 `.py` 分离维护，但 Python 类型检查器通常只读取 `.pyi`，并不会自动证明实现符合它。社区会使用 `mypy stubtest` 通过运行时检查寻找两者的不一致。这个案例也说明了分离方案最大的工程风险：声明和实现可能发生漂移。<Cite refs={["turn125748search5","turn125748search9"]}/>

## 三、比函数签名更进一步：把行为约束也变成契约

我觉得这是你的想法最有潜力的延伸。

例如：

```text
fn withdraw(balance: Int, amount: Int) -> Int
```

只有这个签名时，我们并不知道：

- 是否允许透支？
- 负数金额是什么意思？
- 余额不足时应该报错还是返回原余额？
- 是否允许更改外部状态？

所以仅审查签名，仍然很难评价 AI 实现得对不对。

Ada / SPARK 的思路值得借鉴，它支持写在函数规格中的 `Pre`、`Post` 和 `Global` 契约。

```ada
function Withdraw
  (Balance, Amount : Natural) return Natural
with
  Pre  => Amount <= Balance,
  Post => Withdraw'Result = Balance - Amount;
```

这份声明不仅规定类型，还表达了调用者和实现者双方的责任。Ada 可以在运行时检查相应条件，SPARK 则可以尝试静态证明。<Cite ref="turn307826search2"/>

### MoonBit 自己也正在往这个方向发展

我还查到了一个更接近你想法的功能：MoonBit 的实验性形式化验证机制。

它允许：

- 在 `.mbtp` 文件里集中定义 predicate、不变量和证明所需的逻辑模型。
- 在 `.mbt` 文件中通过 `proof_require` 和 `proof_ensure` 关联前后置条件。
- 使用 `moon prove` 尝试验证实现是否满足这些条件。

这已经超出了单纯的“声明文件”，进入了“可机器验证的契约”阶段。<Cite ref="turn501245view0"/>

不过目前 `.mbtp` 不是普通函数声明文件，函数契约仍主要附着在 `.mbt` 定义上，而且整套验证机制尚处于实验阶段。

