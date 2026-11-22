import {
  attributeContains,
  type CaseCheck,
  cleanDiagnostics,
  type DilCase,
  eachWithTag,
  either,
  hasAnyTag,
  hasTag,
  nested,
} from "./scoring.ts";

export { DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";

export const DIL_CASES: readonly DilCase[] = [
  {
    id: "states",
    category: "状态机与分支分类",
    prompt: "梳理 Git 工作区文件从 Untracked 到 Staged、Modified、Committed、Pushed 的状态流转及对应命令。",
    why: "状态流转适合用图来表达",
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
    id: "quiz",
    category: "Basic",
    prompt: "给我出两道 JavaScript 原型链单选题。先别公布答案，让我提交给你批改。",
    why: "考察模型生成题目表单的能力",
    checks: [
      either(
        [hasTag("radio-group", { atLeast: 2 }), eachWithTag("radio-group", "循环生成单选组")],
        "分别呈现两道单选题",
      ),
      nested("radio-group", "radio", "在单选组内提供可选答案"),
      attributeContains("button", "onClick", "issueNewTurn", "提交按钮发起下一轮对话"),
      cleanDiagnostics("解析无诊断"),
    ],
  },
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
];

export type { CaseCheck, DilCase };
