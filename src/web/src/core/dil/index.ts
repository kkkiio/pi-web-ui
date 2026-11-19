/**
 * `src/core/dil` — DIL + Markdown parser.
 *
 * Pure TypeScript with no React or DOM dependency, so the pipeline can be unit-tested
 * in Node against real corpus fixtures:
 *
 *   source ── parse ──────► structural AST + recovery diagnostics   (parser.ts)
 *          ── stream repair ─► close the constructs the tail left open (stream-repair.ts)
 *          ── lowerMarkdown ─► prose → title / text / list / table … (markdown.ts)
 *          ── pruneEmptyIncomplete ─► drop half-streamed containers  (prune.ts)
 *          ── toFallbackMarkdown ─► Markdown projection for copy      (fallback.ts)
 *
 * `parse` never throws: every prefix of a streaming document yields a usable AST plus
 * diagnostics, which is what keeps the transcript stable while tokens arrive.
 */

import { lowerMarkdown } from "./markdown.ts";
import { normalizeSource, parse } from "./parser.ts";
import { pruneEmptyIncomplete } from "./prune.ts";
import { findStateDeclarations, splitStatements } from "./statements.ts";
import type { DilDocument, DilNode } from "./types.ts";

export function parseDocument(source: string): DilDocument {
  const result = parse(source);
  // `sourceLength` marks the fragment that still owns the end of the source: the only
  // one `stream-repair.ts` may close constructs in.
  const tree = pruneEmptyIncomplete(
    lowerMarkdown(result.nodes, { document: true, sourceLength: normalizeSource(source).length }),
  );
  return {
    raw: result.nodes,
    tree,
    state: findStateDeclarations(collectStatements(result.nodes)),
    diagnostics: result.diagnostics,
    diagnosticSummary: result.diagnosticSummary,
  };
}

/** `{@body}` directives may appear anywhere; hoist them regardless of nesting. */
export function collectStatements(nodes: readonly DilNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    switch (node.type) {
      case "stmt":
        out.push(...splitStatements(node.code));
        break;
      case "element":
        collectStatements(node.children, out);
        break;
      case "if":
        for (const branch of node.branches) collectStatements(branch.body, out);
        break;
      case "each":
        collectStatements(node.body, out);
        break;
      default:
        break;
    }
  }
  return out;
}

export { hasDilElements } from "./detect.ts";
export type { DilScope } from "./evaluator.ts";
export { evaluateCondition, evaluateList, evaluateStatements, formatValue, safeEvaluate } from "./evaluator.ts";
export { tidyFallback, toFallbackMarkdown } from "./fallback.ts";
export { fenceToElement, lowerInline, lowerMarkdown, resolveSpanningEmphasis } from "./markdown.ts";
export { normalizeSource, parse, RAW_TEXT_TAGS } from "./parser.ts";
export { CONTAINER_TAGS, pruneEmptyIncomplete } from "./prune.ts";
export { findTopLevel, LineIndex, readBalanced, splitEachClause, topLevelIndex } from "./scanner.ts";
export type { StateDeclaration } from "./statements.ts";
export { findStateDeclarations, splitStatements, stateKeys } from "./statements.ts";
export type {
  DilAttribute,
  DilAttributeKind,
  DilDiagnostic,
  DilDiagnosticCode,
  DilDocument,
  DilEachNode,
  DilElementNode,
  DilExprNode,
  DilFenceNode,
  DilIfBranch,
  DilIfNode,
  DilNode,
  DilParseResult,
  DilRecoveryAction,
  DilStateDeclaration,
  DilStmtNode,
  DilTextNode,
} from "./types.ts";
export type { DilTagName, TagEntry, TagKind, TagSupport } from "./vocabulary.ts";
export { DIL_VOCABULARY, INLINE_TAGS, isInlineTag, isKnownTag, KNOWN_TAGS, tagEntry } from "./vocabulary.ts";
