/**
 * DIL eval cases — "can the model write a UI, not just prose?"
 *
 * Four positive prompts, each a real coding-agent pain point where prose Markdown is
 * the wrong shape, plus one negative control that must stay plain Markdown. They follow
 * the benchmark design in `docs/` (category, typical prompt, hoped-for DIL shape, why
 * Markdown loses) and are checked structurally, not by an LLM judge: `scoring.ts` walks
 * the parsed AST, so a case passes only if the DIL it asked for is actually there.
 *
 * Prompts are in Chinese because the product's answers are: the interesting question is
 * whether the *layout* impulse survives normal instruction-following, not whether the
 * model can switch language.
 */

import {
  anyTag,
  attributeContains,
  attrPresent,
  type CaseCheck,
  cleanDiagnostics,
  type DilCase,
  eachWith,
  eachWithTag,
  either,
  fenceAtLeast,
  hasAnyTag,
  hasEach,
  hasExprAttribute,
  hasTag,
  maxWords,
  nested,
  nestedAny,
  noDil,
} from "./scoring.ts";

/** The instruction a real system prompt would carry; kept short on purpose. */
export const DIL_SYSTEM_PROMPT = `你是 Pi Web UI 的助手。回答可以用 DIL（Dynamic Interface Language）把密集信息变成可扫读的界面。

DIL 是 Markdown 的超集：普通文字继续用 Markdown；需要空间关系时用这些标签：
<box> <row> <col> <grid columns={n}> <grid-item> <divider>
<title> <text> <caption> <badge> <icon name="…"/> <bold> <italic> <code>
控制流：{#each list as item, i}…{/each}、{#if cond}…{:else}…{/if}、{expr} 插值
常用属性：gap={2} padding={3} background="surface|surface-secondary|surface-tertiary" radius="md|lg|xl|full" border color="secondary|success|warning|danger" size="xs|sm|md|lg|xl" weight="medium|semibold" align="start|center|between" justify="between|center" tabularNums width height flex

规则：
1. 只有空间/关系/对比/流程真的比文字更清楚时才用 DIL；两句话能说清就保持纯 Markdown 和代码块。
2. 标签必须闭合；属性值用 {表达式} 时只写可安全求值的 JS 子集（字面量、算术、比较、模板串、.map/.filter/.toFixed 等）。
3. 不要在 DIL 外层再包一个代码围栏，直接输出。`;

export const DIL_CASES: readonly DilCase[] = [
  {
    id: "flow",
    category: "架构分层与因果流",
    prompt:
      "解释 pi-web-ui 中从浏览器点击发送按钮到 mirror-server.ts 再到 Pi 进程的事件流转与返回路径。用图的形式让我一眼看出跨了哪些进程边界。",
    why: "纯文字列表看不出谁包着谁、哪一步跨了进程边界。",
    checks: [
      hasTag("box", { atLeast: 2, label: "进程边界用 <box> 分组" }),
      nestedAny(
        [
          ["box", "box"],
          ["box", "grid"],
          ["grid", "grid-item"],
          ["box", "grid-item"],
        ],
        "容器分层（嵌套 box / grid）",
      ),
      anyTag(["row", "grid"], { label: "横向并排布局（row 或 grid）" }),
      either([hasTag("icon"), hasTag("badge", { atLeast: 2 })], "方向/角色用 <icon> 或 <badge> 标记"),
      hasTag("badge", { label: "边界/协议用 <badge> 标注" }),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "comparison",
    category: "多维方案权衡",
    prompt:
      "对比我们做 DIL 渲染器的三种方案：iframe 沙箱、Web Worker 虚拟树、主线程 AST 求值。给出各自优劣与选型结论。",
    why: "窄屏 Markdown 表格会折行成麻花，大段文字对比需要上下翻屏记忆。",
    checks: [
      hasTag("grid", { label: "三种方案用 <grid> 并排" }),
      attributeContains("grid", "columns", "3", "grid columns={3}"),
      hasTag("badge", { atLeast: 2, label: "优/劣用 <badge> 标记" }),
      hasTag("box", { label: "底部结论用 <box> 收束" }),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "proportions",
    category: "定量占比与结构拆解",
    prompt:
      "一个 128k Context Window 被 System Prompt（12%）、Tool Definitions（28%）、File Reads（45%）和 Conversation（15%）占满，帮我直观展示并给出裁剪建议。",
    why: "纯数字列表没有视觉面积感，一眼看不出大头在哪。",
    checks: [
      hasEach("用 {#each} 生成占比行"),
      eachWith("box", { attr: "width", contains: "%", label: "each 内用 width 百分比画条" }),
      hasExprAttribute("width", "%", "width 是百分比表达式"),
      attrPresent("tabularNums", "数字用 tabularNums 对齐"),
      nested("box", "box", "双层 <box>：轨道 + 填充"),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "states",
    category: "状态机与分支分类",
    prompt:
      "梳理 Git 工作区文件从 Untracked 到 Staged、Modified、Committed、Pushed 的状态流转及对应命令。哪些转换是可逆的？",
    why: "线性文字难以表达多个状态的对称分类。",
    checks: [
      either(
        [hasEach("用 {#each} 表示状态集合"), hasTag("grid-item", { atLeast: 4, label: "状态卡片铺开" })],
        "状态成组（each 循环或卡片）",
      ),
      anyTag(["grid", "row", "col"], { label: "状态卡片用 grid / row 布局" }),
      either(
        [
          eachWithTag("code", "每个状态卡片带 <code> 命令标签"),
          hasAnyTag("code", { atLeast: 4, label: "每个状态带 <code> 命令标签" }),
        ],
        "每个状态带 <code> 命令标签",
      ),
      hasTag("badge", { label: "可逆/不可逆用 <badge> 标记" }),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "restraint",
    category: "负向克制测试（关键）",
    prompt:
      "把下面这段 Promise.then 改成 async/await：\n\n```js\nfetch('/api/items')\n  .then((res) => res.json())\n  .then((items) => items.filter((item) => item.active));\n```\n\n然后一句话解释你改了什么。",
    why: "如果模型连两句话回答都硬套一个 <box>，说明 system prompt 引导过度（over-triggering）。",
    checks: [
      noDil("不出现任何 DIL 标签"),
      fenceAtLeast(1, "保留 Markdown 代码块"),
      maxWords(160, "回答保持简洁"),
      cleanDiagnostics("解析无诊断"),
    ],
  },
];

export type { CaseCheck, DilCase };
