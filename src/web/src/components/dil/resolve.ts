/**
 * AST → resolved render tree.
 *
 * `parseDocument` is deliberately inert: it keeps `{#each}`, `{#if}` and `{expr}` as
 * nodes, because evaluation is a policy decision (and, in the reference client, a
 * sandbox). This module applies that policy once per render and hands React a flat,
 * fully-resolved tree:
 *
 *   {#each items as m}  → the body, repeated with `m` (and `i`) bound
 *   {#if cond} …        → the first true branch, or nothing
 *   {expr}              → formatted text, or nothing when the value is nullish
 *   attr={expr}         → the evaluated value; `__dilSafe` fallback is `undefined`
 *
 * It is pure TypeScript with no React import, so the whole expansion is unit-tested in
 * Node (`resolve.test.ts`) — the components below only turn resolved nodes into JSX.
 *
 * Failure policy matches `evaluator.ts`: a broken condition is false, a broken list is
 * empty, a broken value is absent. One bad expression never takes down its siblings.
 */

import type { DilScope } from "../../core/dil/evaluator.ts";
import {
  bindEachPattern,
  evaluateCondition,
  evaluateList,
  formatValue,
  safeEvaluate,
} from "../../core/dil/evaluator.ts";
import type { DilElementNode, DilFenceNode, DilNode } from "../../core/dil/types.ts";

export type ResolvedProps = Readonly<Record<string, unknown>>;

export type ResolvedNode =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "element";
      readonly name: string;
      readonly synthetic?: boolean;
      readonly props: ResolvedProps;
      readonly children: readonly ResolvedNode[];
    };

/**
 * Upper bound on resolved nodes for one render.
 *
 * The evaluator caps the work of a single expression, but nested loops multiply their
 * *output*: `{#each 400}{#each 400}` is 160k nodes from two small lists, and pushing them
 * onto one array overflows the stack. A shared budget bounds the pass itself.
 */
const MAX_RESOLVED_NODES = 5_000;

interface Budget {
  remaining: number;
}

/** Expand control flow and interpolations into a tree of elements and text. */
export function resolveNodes(
  nodes: readonly DilNode[],
  scope: DilScope,
  budget: Budget = { remaining: MAX_RESOLVED_NODES },
): ResolvedNode[] {
  const out: ResolvedNode[] = [];
  for (const node of nodes) {
    if (budget.remaining <= 0) break;
    // Never spread: the array is capped, but the spread itself is what overflows.
    for (const resolved of resolveNode(node, scope, budget)) out.push(resolved);
  }
  return out;
}

function resolveNode(node: DilNode, scope: DilScope, budget: Budget): ResolvedNode[] {
  switch (node.type) {
    case "text":
      if (!node.value) return [];
      budget.remaining -= 1;
      return [{ kind: "text", value: node.value }];

    case "expr": {
      const value = formatValue(safeEvaluate(node.code, scope, undefined));
      if (!value) return [];
      budget.remaining -= 1;
      return [{ kind: "text", value }];
    }

    case "stmt":
      // Hoisted into the scope before rendering; never a rendered node.
      return [];

    case "fence":
      budget.remaining -= 1;
      return [fenceNode(node)];

    case "if":
      for (const branch of node.branches) {
        if (evaluateCondition(branch.cond, scope)) return resolveNodes(branch.body, scope, budget);
      }
      return [];

    case "each": {
      const items = evaluateList(node.list, scope);
      const out: ResolvedNode[] = [];
      items.forEach((item, index) => {
        if (budget.remaining <= 0) return;
        const frame: Record<string, unknown> = { ...scope };
        bindEachPattern(node.item, item, frame, scope);
        if (node.index) frame[node.index] = index;
        for (const resolved of resolveNodes(node.body, frame, budget)) out.push(resolved);
      });
      return out;
    }

    case "element": {
      budget.remaining -= 1;
      return [
        {
          kind: "element",
          name: node.name,
          ...(node.synthetic && { synthetic: true }),
          // `closed` is structural, not an attribute: lowering puts it on the node (an
          // unterminated fence, an unclosed tag), and the heavy leaves render their source
          // instead of typesetting/highlighting until it is true.
          props: { ...resolveAttributes(node, scope), closed: node.closed },
          children: resolveNodes(node.children, scope, budget),
        },
      ];
    }

    default:
      return [];
  }
}

/**
 * Attribute values, in the four forms the parser records:
 *
 *   boolean   `border`              → true
 *   string    `radius="lg"`         → "lg"
 *   raw       `width=100%`          → "100%"   (streaming tolerance, not grammar)
 *   expression `{n}` / `{{x: 2}}`   → evaluated, undefined on failure
 */
export function resolveAttributes(node: DilElementNode, scope: DilScope): ResolvedProps {
  const props: Record<string, unknown> = {};
  for (const attribute of node.attrs) {
    switch (attribute.kind) {
      case "boolean":
        props[attribute.name] = true;
        break;
      case "string":
      case "raw":
        props[attribute.name] = attribute.value;
        break;
      case "expr":
        props[attribute.name] = safeEvaluate(String(attribute.value), scope, undefined);
        break;
    }
  }
  return props;
}

/** A fenced block is already an element; #49 will give `code-block` a real renderer. */
function fenceNode(fence: DilFenceNode): ResolvedNode {
  if (fence.kind === "math") {
    return {
      kind: "element",
      name: "math",
      props: { value: fence.value, block: true, closed: fence.closed },
      children: [],
    };
  }
  return {
    kind: "element",
    name: "code-block",
    props: { language: firstWord(fence.info), closed: fence.closed },
    children: fence.value ? [{ kind: "text", value: fence.value }] : [],
  };
}

function firstWord(info: string): string | undefined {
  const word = info.trim().split(/\s+/)[0];
  return word || undefined;
}
