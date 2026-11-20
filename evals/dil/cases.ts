/**
 * DIL eval cases — "can the model write a UI, not just prose?"
 *
 * Prompts are user asks, not format orders: no "draw a diagram", no "use a grid".
 * If a prompt asked for the layout, the score would measure instruction-following of
 * our own hint instead of whether the DIL system section makes the model reach for one.
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
  attributeContains,
  type CaseCheck,
  cleanDiagnostics,
  type DilCase,
  either,
  fenceAtLeast,
  hasAnyTag,
  hasTag,
  maxWords,
  nested,
  noDil,
} from "./scoring.ts";

export { DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";

export const DIL_CASES: readonly DilCase[] = [
  // {
  //   id: "flow",
  //   category: "架构分层与因果流",
  //   prompt: "解释 pi-web-ui 中从浏览器点击发送按钮到 mirror-server.ts 再到 Pi 进程的事件流转与返回路径。",
  //   why: "纯文字列表看不出谁包着谁、哪一步跨了进程边界。",
  //   requiresRepo: true,
  //   checks: [
  //     hasTag("box", { atLeast: 2, label: "进程边界用 <box> 分组" }),
  //     nested("box", "box", "嵌套 <box>（谁包着谁）"),
  //     hasTag("row", { label: "流程用 <row> 横向排列" }),
  //     attributeContains("icon", "name", "arrow", '用 <icon name="arrow-…"> 标方向'),
  //     hasTag("badge", { label: "边界/协议用 <badge> 标注" }),
  //     cleanDiagnostics("解析无诊断"),
  //   ],
  // },
  {
    id: "codemode-sandbox",
    category: "架构分层与因果流",
    prompt: "解释 pi agent codemode 有哪些隔离机制，在 LLM 用 codemode 执行代码、 codemode 执行 tools 上是怎么体现的",
    why: "图形可以清晰地表达 codemode sandbox 各个模块的边界和包含关系",
    projectRepo: "https://github.com/earendil-works/pi@v1.0.0",
    checks: [
      hasTag("box", { atLeast: 2, label: "进程边界用 <box> 分组" }),
      nested("box", "box", "嵌套 <box>（谁包着谁）"),
      hasTag("row", { label: "流程用 <row> 横向排列" }),
      attributeContains("icon", "name", "arrow", '用 <icon name="arrow-…"> 标方向'),
      hasTag("badge", { label: "边界/协议用 <badge> 标注" }),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  // {
  //   id: "comparison",
  //   category: "多维方案权衡",
  //   prompt: "对比我们做 DIL 渲染器的三种方案：iframe 沙箱、Web Worker 虚拟树、主线程 AST 求值，给出优劣与选型结论。",
  //   why: "窄屏 Markdown 表格会折行成麻花，大段文字对比需要上下翻屏记忆。",
  //   requiresRepo: true,
  //   checks: [
  //     hasTag("grid", { label: "三种方案用 <grid> 并排" }),
  //     attributeContains("grid", "columns", "3", "grid columns={3}"),
  //     hasTag("badge", { atLeast: 2, label: "优/劣用 <badge> 标记" }),
  //     attributeIn("badge", "color", ["success", "warning"], "badge 用 success / warning 区分优劣"),
  //     hasTag("box", { label: "底部结论用 <box> 收束" }),
  //     cleanDiagnostics("解析无诊断"),
  //   ],
  // },
  // {
  //   id: "proportions",
  //   category: "定量占比与结构拆解",
  //   prompt:
  //     "一个 128k Context Window 被 System Prompt (12%)、Tool Definitions (28%)、File Reads (45%) 和 Conversation (15%) 占满，帮我直观展示并给出裁剪建议。",
  //   why: "纯数字列表没有视觉面积感，一眼看不出大头在哪。",
  //   checks: [
  //     hasEach("用 {#each} 生成占比行"),
  //     eachWith("box", { attr: "width", contains: "%", label: "each 内用 width 百分比画条" }),
  //     hasExprAttribute("width", "%", "width 是百分比表达式"),
  //     attrPresent("tabularNums", "数字用 tabularNums 对齐"),
  //     nested("box", "box", "双层 <box>：轨道 + 填充"),
  //     cleanDiagnostics("解析无诊断"),
  //   ],
  // },
  {
    id: "pi-system-prompt-construct",
    category: "定量占比与结构拆解",
    prompt:
      "如果我在当前 pi 仓库根目录用默认配置启动 pi coding agent（干净的全局环境，无 ~/.pi 全局配置，自动加载本仓库自带的 extensions、skills 和上下文文件如 AGENTS.md），最终发给模型的 System Prompt 按字符数估算大概有多大？由哪几部分按什么顺序组成，分别占比多少？",
    why: "图像可以同时表达顺序和面积感",
    projectRepo: "https://github.com/earendil-works/pi@v1.0.0",
    checks: [
      either(
        [
          attributeContains("box", "width", "%", '用 <box width="…%"> 表达面积占比'),
          hasTag("svg", { label: "用 <svg> 表达面积占比" }),
        ],
        "用百分比 <box> 或 <svg> 表达面积占比",
      ),
      either(
        [
          nested("box", "box", "嵌套 <box>（外框/轨道 + 分段/填充）"),
          hasTag("svg", { label: "用 <svg> 表达结构层次" }),
        ],
        "嵌套 <box> 或 <svg> 表达结构层次",
      ),
      either(
        [hasTag("row", { label: "用 <row> 横向排布分段或图例" }), hasTag("svg", { label: "用 <svg> 横向排布分段" })],
        "用 <row> 或 <svg> 横向排布分段",
      ),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "states",
    category: "状态机与分支分类",
    prompt: "梳理 Git 工作区文件从 Untracked 到 Staged、Modified、Committed、Pushed 的状态流转及对应命令。",
    why: "线性文字难以表达多个状态的对称分类。",
    checks: [
      either(
        [hasTag("grid", { label: "状态用 <grid> 卡片铺开" }), hasTag("svg", { label: "状态用 <svg> 状态图表达" })],
        "用 <grid> 卡片或 <svg> 表达状态结构",
      ),
      hasTag("box", { atLeast: 2, label: "用 <box> 分组状态或操作" }),
      hasAnyTag("code", { atLeast: 4, label: "每个状态带 <code> 命令标签" }),
      cleanDiagnostics("解析无诊断"),
    ],
  },
  {
    id: "restraint-refactor",
    category: "负向克制测试",
    prompt:
      "把下面这段 Promise.then 改成 async/await：\n\n```js\nfetch('/api/items')\n  .then((res) => res.json())\n  .then((items) => items.filter((item) => item.active));\n```",
    why: "代码改写要的是代码块，不是卡片；硬套 <box> 说明 system prompt 引导过度。",
    checks: [
      noDil("不出现任何 DIL 标签"),
      fenceAtLeast(1, "保留 Markdown 代码块"),
      maxWords(160, "回答保持简洁"),
      cleanDiagnostics("解析无诊断"),
    ],
  },
];

export type { CaseCheck, DilCase };
