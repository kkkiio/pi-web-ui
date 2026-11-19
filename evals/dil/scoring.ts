/**
 * Structural scoring for DIL evals.
 *
 * An LLM judge can tell you whether an answer "feels" clear, but not whether the DIL is
 * real: a model that writes `<box>` inside a fenced code block, forgets `{/each}`, or
 * invents `<CardGrid>` produces prose that reads fine and renders as garbage. So the
 * first gate is deterministic — parse the answer with `parseDocument` and assert the
 * structure the prompt asked for, plus a diagnostics count.
 *
 * The negative-control case is the mirror image: it passes only when *no* DIL appears.
 */

import { parseDocument } from "../../src/web/src/core/dil/index.ts";
import type { DilAttribute, DilDocument, DilNode } from "../../src/web/src/core/dil/types.ts";

export interface CaseCheck {
  readonly id: string;
  readonly label: string;
  readonly test: (context: CaseContext) => boolean;
}

export interface DilCase {
  readonly id: string;
  readonly category: string;
  readonly prompt: string;
  /** Why Markdown alone is the wrong shape for this prompt. */
  readonly why: string;
  /** True when the prompt asks about this repository specifically (skipped in isolated runs to avoid eval leakage). */
  readonly requiresRepo?: boolean;
  readonly checks: readonly CaseCheck[];
}

export interface CaseContext {
  readonly text: string;
  /** Structural AST before prose lowering, so source tags/attrs are visible. */
  readonly raw: readonly DilNode[];
  readonly parse: DilDocument;
  readonly elements: readonly DilNode[];
  readonly words: number;
}

export interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly checks: readonly { readonly id: string; readonly label: string; readonly pass: boolean }[];
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly diagnostics: string;
  readonly dilNodes: number;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const DIL_TAGS = new Set([
  "box",
  "row",
  "col",
  "grid",
  "grid-item",
  "divider",
  "title",
  "text",
  "caption",
  "badge",
  "icon",
  "bold",
  "italic",
  "code",
  "list",
  "list-item",
  "table",
  "table-row",
  "table-cell",
  "blockquote",
  "math",
  "code-block",
  "Link",
]);

/** DIL elements the model actually wrote (Markdown lowers share the same names). */
export function dilElements(nodes: readonly DilNode[], out: DilNode[] = []): DilNode[] {
  for (const node of nodes) {
    if (node.type === "element") {
      // Lowered Markdown is `synthetic`; only source tags count as a DIL choice.
      if (!node.synthetic && DIL_TAGS.has(node.name)) out.push(node);
      dilElements(node.children, out);
    } else if (node.type === "if") {
      out.push(node);
      for (const branch of node.branches) dilElements(branch.body, out);
    } else if (node.type === "each") {
      out.push(node);
      dilElements(node.body, out);
    } else if (node.type === "fence") {
      out.push(node);
    }
  }
  return out;
}

export function contextOf(text: string): CaseContext {
  const parse = parseDocument(text);
  const elements = dilElements(parse.raw);
  return {
    text,
    raw: parse.raw,
    parse,
    elements,
    words: countWords(text),
  };
}

function countWords(text: string): number {
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[{}\\/|*_~`#>=-]/g, " ");
  const latin = prose.match(/[A-Za-z0-9][\w'’-]*/g)?.length ?? 0;
  const cjk = prose.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  // One CJK character carries roughly a word; count it as such.
  return latin + cjk;
}

function elementName(node: DilNode): string | null {
  return node.type === "element" ? node.name : node.type === "each" ? "each" : null;
}

function attrsOf(node: DilNode): readonly DilAttribute[] {
  return node.type === "element" ? node.attrs : [];
}

function attrText(attribute: DilAttribute): string {
  return typeof attribute.value === "string" ? attribute.value : String(attribute.value);
}

function childrenOf(node: DilNode): readonly DilNode[] {
  if (node.type === "element") return node.children;
  if (node.type === "each") return node.body;
  return [];
}

// ---------------------------------------------------------------------------
// Check builders — each returns a labelled, boolean check
// ---------------------------------------------------------------------------

/** Source tags *and* Markdown langs (a `<code>` written as backticks still counts). */
export function hasAnyTag(name: string, options: { atLeast?: number; label?: string } = {}): CaseCheck {
  const atLeast = options.atLeast ?? 1;
  return {
    id: `anyTag:${name}`,
    label: options.label ?? `出现 ${name} ×${atLeast}`,
    test: (context) => allElements(context.parse.tree).filter((node) => node.name === name).length >= atLeast,
  };
}

function allElements(nodes: readonly DilNode[], out: { name: string }[] = []): { name: string }[] {
  for (const node of nodes) {
    if (node.type === "element") {
      out.push(node);
      allElements(node.children, out);
    } else if (node.type === "if") {
      for (const branch of node.branches) allElements(branch.body, out);
    } else if (node.type === "each") {
      allElements(node.body, out);
    }
  }
  return out;
}

/** Any of these tags — when several shapes are equally good answers. */
export function anyTag(names: readonly string[], options: { atLeast?: number; label?: string } = {}): CaseCheck {
  const atLeast = options.atLeast ?? 1;
  return {
    id: `anyTag:${names.join("|")}`,
    label: options.label ?? `出现 ${names.join(" 或 ")} ×${atLeast}`,
    test: (context) => context.elements.filter((node) => names.includes(elementName(node) ?? "")).length >= atLeast,
  };
}

/** At least one of these checks passes — a capability, not one exact shape. */
export function either(checks: readonly CaseCheck[], label: string): CaseCheck {
  return {
    id: `either:${checks.map((check) => check.id).join("|")}`,
    label,
    test: (context) => checks.some((check) => check.test(context)),
  };
}

/** Nesting among any of these (outer, inner) pairs. */
export function nestedAny(pairs: readonly (readonly [string, string])[], label: string): CaseCheck {
  return {
    id: `nested:${pairs.map((pair) => pair.join(">")).join("|")}`,
    label,
    test: (context) => pairs.some(([outer, inner]) => nested(outer, inner, label).test(context)),
  };
}

export function hasTag(name: string, options: { atLeast?: number; label?: string } = {}): CaseCheck {
  const atLeast = options.atLeast ?? 1;
  return {
    id: `tag:${name}`,
    label: options.label ?? `出现 <${name}> ×${atLeast}`,
    test: (context) => context.elements.filter((node) => elementName(node) === name).length >= atLeast,
  };
}

export function nested(outer: string, inner: string, label: string): CaseCheck {
  return {
    id: `nested:${outer}>${inner}`,
    label,
    test: (context) => {
      const walk = (nodes: readonly DilNode[]): boolean =>
        nodes.some((node) =>
          elementName(node) === outer
            ? contains(childrenOf(node), inner) || walk(childrenOf(node))
            : walk(childrenOf(node)),
        );
      return walk(context.raw);
    },
  };
}

function contains(nodes: readonly DilNode[], name: string): boolean {
  return nodes.some((node) => elementName(node) === name || contains(childrenOf(node), name));
}

export function hasEach(label: string): CaseCheck {
  return {
    id: "each",
    label,
    test: (context) => context.elements.some((node) => elementName(node) === "each"),
  };
}

/** `{#each}` whose body draws a bar: an element with `attr` containing `contains`. */
/** A repeated body that contains `name` — the loop renders one per item. */
export function eachWithTag(name: string, label: string): CaseCheck {
  return {
    id: `each:tag:${name}`,
    label,
    test: (context) =>
      context.elements.some((node) => elementName(node) === "each" && contains(childrenOf(node), name)),
  };
}

export function eachWith(name: string, options: { attr: string; contains: string; label: string }): CaseCheck {
  return {
    id: `each:${name}.${options.attr}`,
    label: options.label,
    test: (context) =>
      context.elements.some(
        (node) =>
          elementName(node) === "each" && hasAttributeIn(childrenOf(node), name, options.attr, options.contains),
      ),
  };
}

function hasAttributeIn(nodes: readonly DilNode[], name: string, attr: string, contains: string): boolean {
  return nodes.some((node) => {
    if (elementName(node) === name) {
      if (attrsOf(node).some((attribute) => attribute.name === attr && attrText(attribute).includes(contains))) {
        return true;
      }
    }
    return hasAttributeIn(childrenOf(node), name, attr, contains);
  });
}

export function hasExprAttribute(name: string, contains: string, label: string): CaseCheck {
  return {
    id: `exprAttr:${name}`,
    label,
    test: (context) =>
      context.elements.some((node) =>
        attrsOf(node).some(
          (attribute) => attribute.name === name && attribute.kind === "expr" && attrText(attribute).includes(contains),
        ),
      ),
  };
}

export function attrPresent(name: string, label: string): CaseCheck {
  return {
    id: `attr:${name}`,
    label,
    test: (context) => context.elements.some((node) => attrsOf(node).some((attribute) => attribute.name === name)),
  };
}

/** `<badge color="success">` or `<badge color="warning">`: one of a known set. */
export function attributeIn(name: string, attr: string, values: readonly string[], label: string): CaseCheck {
  return {
    id: `attr:${name}.${attr}∈${values.join("|")}`,
    label,
    test: (context) =>
      context.elements.some(
        (node) =>
          elementName(node) === name &&
          attrsOf(node).some((attribute) => attribute.name === attr && values.includes(attrText(attribute))),
      ),
  };
}

export function attributeContains(name: string, attr: string, contains: string, label: string): CaseCheck {
  return {
    id: `attr:${name}.${attr}`,
    label,
    test: (context) =>
      context.elements.some(
        (node) =>
          elementName(node) === name &&
          attrsOf(node).some((attribute) => attribute.name === attr && attrText(attribute).includes(contains)),
      ),
  };
}

export function noDil(label: string): CaseCheck {
  return {
    id: "no-dil",
    label,
    test: (context) => context.elements.filter((node) => node.type === "element").length === 0,
  };
}

export function fenceAtLeast(count: number, label: string): CaseCheck {
  return {
    id: "fence",
    label,
    test: (context) => countFences(context.parse.raw) >= count,
  };
}

function countFences(nodes: readonly DilNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.type === "fence" ? 1 : countFences(childrenOf(node))), 0);
}

/** Sentence count instead of a word budget: "两句话以内" is about sentences, not tokens. */
export function maxSentences(limit: number, label: string): CaseCheck {
  return {
    id: "max-sentences",
    label,
    test: (context) => {
      const prose = context.text.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
      const sentences = prose
        .split(/[。！？!?]+/)
        .map((part) => part.trim())
        .filter(Boolean);
      return sentences.length <= limit;
    },
  };
}

export function maxWords(limit: number, label: string): CaseCheck {
  return {
    id: "max-words",
    label,
    test: (context) => context.words <= limit,
  };
}

export function cleanDiagnostics(label: string): CaseCheck {
  return {
    id: "diagnostics",
    label,
    test: (context) => context.parse.diagnostics.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Run one case over model output. Score is the fraction of checks that pass. */
export function scoreCase(dilCase: DilCase, text: string): CaseResult {
  const context = contextOf(text);
  const checks = dilCase.checks.map((check) => ({ id: check.id, label: check.label, pass: safeTest(check, context) }));
  const passed = checks.filter((check) => check.pass).length;
  return {
    id: dilCase.id,
    category: dilCase.category,
    text,
    checks,
    passed,
    total: checks.length,
    score: checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100),
    diagnostics: context.parse.diagnosticSummary,
    dilNodes: context.elements.filter((node) => node.type === "element").length,
  };
}

function safeTest(check: CaseCheck, context: CaseContext): boolean {
  try {
    return check.test(context);
  } catch {
    return false;
  }
}

export interface VariantSummary {
  readonly variant: string;
  readonly cases: readonly CaseResult[];
  readonly score: number;
  readonly passed: number;
  readonly total: number;
}

export function summarize(variant: string, cases: readonly CaseResult[]): VariantSummary {
  const passed = cases.reduce((sum, result) => sum + result.passed, 0);
  const total = cases.reduce((sum, result) => sum + result.total, 0);
  return { variant, cases, passed, total, score: total === 0 ? 0 : Math.round((passed / total) * 100) };
}
