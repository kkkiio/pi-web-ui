# `src/core/dil` — Unified Markdown + DIL Parser & Evaluator

Pure TypeScript parser, AST lowering pipeline, and safe expression evaluator for rendering OpenAI DIL (Dynamic Interface Language) mixed with Markdown directly in the browser.

This module has **zero React or DOM dependencies** so it can be unit-tested directly in Node against real DIL corpus fixtures.

## Positioning & Responsibilities

1. **Tolerant Unified Parsing (`parser.ts`, `scanner.ts`, `markdown.ts`)**:
   - Parses inline DIL tags (`<box>`, `<row>`, `<col>`, `<grid>`, `<list>`, `<svg>`, `<button>`, `<radio-group>`, etc.), template control blocks (`{#if}`, `{:else}`, `{#each}`), and state directives (`{@body const [x, setX] = DIL.useState(...)}`) alongside standard Markdown prose (headings, paragraphs, lists, GFM tables, fenced code blocks, and LaTeX math).
   - Preserves literal text inside fenced code blocks (` ``` `), inline code spans (`` ` ``), and raw text tags (`<code>`, `<pre>`).
   - Recovers gracefully from incomplete streaming prefixes (dropping unterminated opening tags `<tag ...`, auto-closing open blocks at EOF, and pruning incomplete empty container nodes).
2. **Model Output Repair (`repair.ts`)**:
   - Infers and declares missing `DIL.useState` bindings when controlled props (`value={x} onChange={setX}`) are emitted without a matching `{@body}` declaration.
3. **Safe Expression & Action Evaluation (`evaluator.ts`)**:
   - Evaluates pure data expressions (`{...}`) with per-expression `__dilSafe(evaluate, failureValue)` error boundaries.
   - Bridges local state updates (`DIL.useState`) and host actions (`GenUI.issueNewTurn`, `GenUI.openUrl`).
4. **Plain-Text Fallback Projection (`fallback.ts`)**:
   - Projects the unified AST into clean Markdown (`toFallbackMarkdown`) for "Copy as Markdown" and transcript quoting.

## Roadmap

- **Phase 1 ([#46](https://github.com/kkkiio/pi-web-ui/issues/46))**: Spatial/relational layout tags, typography, lists/tables, and unified Markdown lowering.
- **Phase 2 ([#47](https://github.com/kkkiio/pi-web-ui/issues/47))**: `{#each}` / `{#if}` directives, `__dilSafe` expression evaluation, and parametric `<svg>` nodes.
- **Phase 3 ([#48](https://github.com/kkkiio/pi-web-ui/issues/48))**: `{@body DIL.useState}`, interactive form controls, and `GenUI.issueNewTurn` host bridge.
