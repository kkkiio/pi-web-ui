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
  parseClean: "Parses without diagnostics",
  renderClean: "Renders without runtime errors",
  labeledConcepts: "Uses labeled boundaries for concepts",
  visibleConnections: "Uses visible connections between concepts",
  flowDirection: "Shows flow direction",
  nestedBoundaries: "Shows containment through nested boundaries",
  colorDistinction: "Distinguishes related elements by color",
  singleChoiceQuestions: "Presents independent single-choice questions",
  submitSelectedAnswers: "Submits the selected answers",
  svgTextWithinBoxes: "SVG text stays within its boxes",
  svgTextReadability: "SVG text is readable",
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
