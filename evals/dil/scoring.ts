import { parseDocument, tagEntry } from "../../src/web/src/core/dil/index.ts";
import type { DilNode } from "../../src/web/src/core/dil/types.ts";

export type CaseCheck =
  | { readonly id: "labeledConcepts" | "visibleConnections" | "flowDirection"; readonly atLeast?: number }
  | { readonly id: "singleChoiceQuestions" | "submitSelectedAnswers"; readonly count: number }
  | { readonly id: "nestedBoundaries" | "colorDistinction" };

export interface DilCase {
  readonly id: string;
  readonly category: string;
  readonly prompt: string;
  readonly why: string;
  readonly projectRepo?: string;
  readonly checks: readonly CaseCheck[];
}

export const CHECK_LABELS = {
  parseClean: "解析无诊断",
  renderClean: "渲染完成且无运行时错误",
  labeledConcepts: "用带标签的边界区分概念",
  visibleConnections: "用可见连线关联概念",
  flowDirection: "用箭头标明流转方向",
  nestedBoundaries: "用嵌套边界表达包含关系",
  colorDistinction: "用颜色区分同组元素",
  singleChoiceQuestions: "呈现独立可选的单选题",
  submitSelectedAnswers: "实际提交所选答案",
  svgTextWithinBoxes: "SVG 框内文字无明显越界",
  svgTextReadability: "SVG 文字可读性",
} as const;

export type CheckId = keyof typeof CHECK_LABELS;

export interface CheckResult {
  readonly id: CheckId;
  readonly label: string;
  readonly pass: boolean | null;
  readonly detail?: string;
}

export interface CaseTrace {
  readonly toolCallCount?: number;
  readonly toolNames?: readonly string[];
  readonly assistantTurns?: number;
  readonly trajectoryFile?: string;
}

export interface CaseResult extends CaseTrace {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly checks: readonly CheckResult[];
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly unscored: number;
  readonly diagnostics: string;
  readonly dilNodes: number;
}

/** Combine the parser verdict with the available render and judge verdicts. */
export function scoreCase(
  dilCase: DilCase,
  text: string,
  trace?: CaseTrace,
  renderedChecks: readonly CheckResult[] = [],
): CaseResult {
  const parsed = parseDocument(text);
  const checks: CheckResult[] = [
    {
      id: "parseClean",
      label: CHECK_LABELS.parseClean,
      pass: parsed.diagnostics.length === 0,
      detail: parsed.diagnosticSummary,
    },
    ...renderedChecks,
  ];
  const pending: DilNode[] = [...parsed.raw];
  let dilNodes = 0;
  while (pending.length) {
    const node = pending.pop();
    if (node?.type === "element") {
      if (!node.synthetic && tagEntry(node.name)?.source) dilNodes++;
      for (const child of node.children) pending.push(child);
    } else if (node?.type === "each") {
      for (const child of node.body) pending.push(child);
    } else if (node?.type === "if") {
      for (const branch of node.branches) {
        for (const child of branch.body) pending.push(child);
      }
    }
  }
  const passed = checks.filter(({ pass }) => pass === true).length;
  const unscored = checks.filter(({ pass }) => pass === null).length;
  const total = checks.length - unscored;
  return {
    ...trace,
    id: dilCase.id,
    category: dilCase.category,
    text,
    checks,
    passed,
    total,
    unscored,
    score: Math.round((passed / total) * 100),
    diagnostics: parsed.diagnosticSummary,
    dilNodes,
  };
}

export interface VariantSummary {
  readonly variant: string;
  readonly cases: readonly CaseResult[];
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly unscored: number;
}

/** Aggregate verdicts across cases while retaining the number of unscored checks. */
export function summarize(variant: string, cases: readonly CaseResult[]): VariantSummary {
  const passed = cases.reduce((sum, result) => sum + result.passed, 0);
  const total = cases.reduce((sum, result) => sum + result.total, 0);
  const unscored = cases.reduce((sum, result) => sum + result.unscored, 0);
  return { variant, cases, passed, total, unscored, score: total === 0 ? 0 : Math.round((passed / total) * 100) };
}
