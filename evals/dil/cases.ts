import type { DilCase } from "./scoring.ts";

export { DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";

export const DIL_CASES: readonly DilCase[] = [
  {
    id: "states",
    category: "状态机与分支分类",
    prompt: "梳理 Git 工作区文件从 Untracked 到 Staged、Modified、Committed、Pushed 的状态流转及对应命令。",
    why: "状态流转适合用图来表达",
    checks: [
      { id: "labeledConcepts", atLeast: 5 },
      { id: "flowDirection", atLeast: 4 },
    ],
  },
  {
    id: "quiz",
    category: "数据库事务入门",
    prompt: "给我出两道关于数据库事务 ACID 特性的入门单选题。先别公布答案，等我提交后再批改。",
    why: "考察模型生成题目表单的能力",
    checks: [
      { id: "singleChoiceQuestions", count: 2 },
      { id: "submitSelectedAnswers", count: 2 },
    ],
  },
  {
    id: "codemode-sandbox",
    category: "架构分层与因果流",
    prompt: "解释 pi agent codemode 有哪些隔离机制，在 LLM 用 codemode 执行代码、 codemode 执行 tools 上是怎么体现的",
    why: "图形可以清晰地表达 codemode sandbox 各个模块的边界和包含关系",
    projectRepo: "https://github.com/earendil-works/pi@v1.0.0",
    checks: [{ id: "labeledConcepts", atLeast: 2 }, { id: "nestedBoundaries" }, { id: "flowDirection" }],
  },
  {
    id: "pi-system-prompt-construct",
    category: "定量占比与结构拆解",
    prompt:
      "如果我在当前 pi 仓库根目录用默认配置启动 pi coding agent（干净的全局环境，无 ~/.pi 全局配置，自动加载本仓库自带的 extensions、skills 和上下文文件如 AGENTS.md），最终发给模型的 System Prompt 按字符数估算大概有多大？由哪几部分按什么顺序组成，分别占比多少？",
    why: "图像可以同时表达顺序和面积感",
    projectRepo: "https://github.com/earendil-works/pi@v1.0.0",
    checks: [{ id: "colorDistinction" }],
  },
];
