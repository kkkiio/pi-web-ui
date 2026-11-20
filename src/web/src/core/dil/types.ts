/**
 * Unified DIL + Markdown AST.
 *
 * The shapes mirror `dil.ebnf` one-to-one so the recursive-descent parser in
 * `parser.ts` stays a direct transcription of the grammar. Every node carries the
 * UTF-16 offset of its first character in the normalized source, because the parser
 * never throws: it reports a diagnostic instead, and the UI needs to point at it.
 */

export type DilAttributeKind = "boolean" | "string" | "expr" | "raw";

export interface DilAttribute {
  readonly name: string;
  readonly kind: DilAttributeKind;
  /** `true` for a bare attribute, the literal text for every other kind. */
  readonly value: string | true;
  /** Offset of the value (or of the name for a boolean attribute). */
  readonly pos: number;
}

/**
 * ProseSpan — one stretch of text between DIL constructs, the only input the Markdown
 * lexer ever sees. `raw` text comes from `<code>`/`<code-block>`/`<CodeBlock>` and is never lowered.
 */
export interface DilTextNode {
  readonly type: "text";
  readonly value: string;
  readonly pos: number;
  readonly raw?: boolean;
}

/** `{expression}` interpolation. */
export interface DilExprNode {
  readonly type: "expr";
  readonly code: string;
  readonly pos: number;
}

/** `{@body statement}` — hoisted, not rendered where it appears. */
export interface DilStmtNode {
  readonly type: "stmt";
  readonly name: string;
  readonly code: string;
  readonly pos: number;
}

export interface DilIfBranch {
  /** `null` for the trailing `{:else}` branch. */
  readonly cond: string | null;
  readonly body: DilNode[];
}

export interface DilIfNode {
  readonly type: "if";
  readonly pos: number;
  readonly branches: DilIfBranch[];
}

export interface DilEachNode {
  readonly type: "each";
  readonly pos: number;
  /** List expression, `[]` when the clause was malformed. */
  readonly list: string;
  /** Raw loop pattern, e.g. `item` or `item, i`. */
  readonly pattern: string;
  readonly item: string;
  readonly index: string | null;
  readonly body: DilNode[];
}

export interface DilElementNode {
  readonly type: "element";
  readonly name: string;
  readonly attrs: DilAttribute[];
  readonly children: DilNode[];
  readonly pos: number;
  readonly end: number;
  /** False when the closing tag was missing — the streaming recovery path. */
  readonly closed: boolean;
  /** Produced by Markdown lowering rather than written in the source. */
  readonly synthetic?: boolean;
}

/** Markdown fenced block: raw text, never interpreted as DIL. */
export interface DilFenceNode {
  readonly type: "fence";
  readonly kind: "code" | "math";
  /** Code fence info string (`bash`, `json`, …); empty for math. */
  readonly info: string;
  readonly value: string;
  readonly pos: number;
  readonly end: number;
  readonly closed: boolean;
}

export type DilNode = DilTextNode | DilExprNode | DilStmtNode | DilIfNode | DilEachNode | DilElementNode | DilFenceNode;

export type DilDiagnosticCode =
  | "unterminated_braced_value"
  | "unterminated_string"
  | "unterminated_tag"
  | "unclosed_tag"
  | "unclosed_block"
  | "incomplete_source"
  | "unexpected_terminator"
  | "malformed_terminator"
  | "unknown_block"
  | "unknown_directive"
  | "empty_app_directive"
  | "malformed_each"
  | "mismatched_tag"
  | "mismatched_block_close"
  | "malformed_attribute";

/** What the parser did about a diagnostic: `dropped` nodes never reach the tree. */
export type DilRecoveryAction = "deferred" | "recovered_parse" | "dropped" | "fallback";

export interface DilDiagnostic {
  readonly code: DilDiagnosticCode;
  /** 1-based, in the normalized source. */
  readonly line: number;
  /** 1-based, counted in UTF-16 code units. */
  readonly column: number;
  readonly index: number;
  readonly action?: DilRecoveryAction;
  readonly directive?: string;
  readonly tag?: string;
  readonly expected?: string;
  readonly found?: string;
  readonly name?: string;
  readonly fence?: string;
}

export interface DilParseResult {
  readonly nodes: DilNode[];
  readonly diagnostics: DilDiagnostic[];
  /** `clean`, or `code×n` pairs — the one-line form the UI shows. */
  readonly diagnosticSummary: string;
}

export interface DilDocument {
  /** Structural AST exactly as parsed: prose is still `text`. */
  readonly raw: DilNode[];
  /** Render tree: prose lowered to elements, empty streaming containers pruned. */
  readonly tree: DilNode[];
  readonly diagnostics: DilDiagnostic[];
  readonly diagnosticSummary: string;
}
