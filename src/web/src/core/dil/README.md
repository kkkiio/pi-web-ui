# `src/core/dil` — Unified Markdown + DIL Parser

Pure TypeScript parser and AST lowering pipeline for OpenAI **DIL** (Dynamic Interface
Language) mixed with Markdown. It turns a model response into a **render tree** the
browser can walk, without `eval`, React, or a DOM — so the whole pipeline is unit-tested
in Node against real ChatGPT DIL samples.

Formal grammar: [`dil.ebnf`](./dil.ebnf).

## Pipeline

```
source ── parse ─────────────────► structural AST + recovery diagnostics   parser.ts
       ── resolveSpanningEmphasis ► `**<Link/>**` pairs across nodes      markdown.ts
       ── lowerMarkdown ─────────► prose → title / text / list / table …  markdown.ts
       ── pruneEmptyIncomplete ──► drop half-streamed empty containers    prune.ts
       ───────────────────────────► DilDocument { raw, tree, state, diagnostics }
```

```ts
import { parseDocument, toFallbackMarkdown } from "@/core/dil";

const document = parseDocument(source);
document.tree; // DilNode[] — what the renderer walks
document.state; // [{ name: "tab", setter: "setTab", initial: '"overview"' }]
document.diagnosticSummary; // "clean", or "unclosed_tag×2 unclosed_block×1"
toFallbackMarkdown(document.tree); // Markdown projection for copy / quote
```

### Where the boundary is (language injection)

Following the grammar's lexical modes, the host parser owns **all** DIL syntax; the
Markdown lexer only ever receives prose spans (`DilTextNode`):

```
source ─┬─ ``` / ~~~ / $$ / \[  and  `code` / \(math\) and <code>/<pre>   raw text, never parsed
        ├─ {@body …}  {#if …}  {#each …}  {:else}  {/…}                block nodes
        ├─ <tag attr={…}> … </tag>                                      element nodes
        └─ everything else                                              ProseSpan
                                                                          │
                                          unified + remark-parse + remark-gfm
                                                                          ▼
                                                    title / text / list / table / …
```

So `<box>` or `{#each}` inside a fence, an inline code span or a raw element can never
reach the Markdown lexer, and a Markdown construct can never swallow DIL syntax. A test
pins that contract by walking the raw AST and rejecting DIL-looking prose spans; the
real-sample run shows zero leaks over 76 ChatGPT DIL documents.

### Two prose tiers (`dil.ebnf` §1, §7)

The same characters mean different things at the document level and inside an element:

| | document level — `BlockProse` | element interior — `InlineFlow` |
| --- | --- | --- |
| grammar | headings, lists, tables, quotes, rules, paragraphs | blank lines split paragraphs; **no** block Markdown |
| lexer | `unified` + `remark-parse` + `remark-gfm` (CommonMark + GFM) | `inline.ts` — the `InlineRun` subset |
| `# / - / 1. / \| / >` | block constructs | literal text |
| wrapper | each block becomes its own element | a lone run stays inline; several runs each get one `<text>` |

Two rules make the tiers work:

- **no indented code blocks, anywhere.** DIL indentation is layout and code is always
  fenced, so the document processor disables micromark's `codeIndented`
  (`.data("micromarkExtensions", [{ disable: { null: ["codeIndented"] } }])`) and element
  interiors never see a block lexer at all.
- **inline nodes join the flow.** `{expr}`, `math`, `Link`, `icon`, `badge`, `bold`,
  `italic` and `code` are atoms of the same `InlineRun`. At document level they are
  swapped for placeholders before block lexing (MDX-style) and substituted back into the
  parsed tree — that is what keeps `- <Link …/>` a list item, `## {title}` a heading and
  `公式 $E = mc^2$ 与…` one text flow with its spaces. Positions are mapped back to
  source offsets through the same placeholder table.

The trade-off is deliberate: `InlineRun` accepts `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``, `$math$`, `[label](url)` and `<url>`, but not `_italic_` (the grammar's
ItalicSpan is `*`-only), and a Markdown list written inside a `<box>` stays literal text.

### Modules

| File | Responsibility |
| --- | --- |
| `types.ts` | `DilNode` union, attributes, diagnostics, `DilDocument` |
| `scanner.ts` | Balanced `{}`/`()` scanning that skips strings, templates, regex and comments; top-level splits; inline code/math spans (shared with the parser) |
| `parser.ts` | Recursive descent over `dil.ebnf`: elements, attributes, `{#if}`/`{#each}`, `{@body}`, `{expr}`, fenced blocks, raw text elements |
| `markdown.ts` | Prose injection layers: `BlockProse` (GFM via `unified`/`remark`) and `InlineFlow` (blank-line runs) → DIL elements |
| `stream-repair.ts` | Streaming tail repair: closes an unclosed `**`/`*`/`~~`/`` ` `` and drops a half-received link target before the prose is lexed |
| `inline.ts` | `InlineRun` — the element-interior inline subset (`**bold**`, `*italic*`, `~~strike~~`, code, math, links, autolinks) |
| `entities.ts` | Shared character-reference decoding (prose once, raw text at parse time) |
| `prune.ts` | Streaming pass: unclosed empty containers are not rendered (anti-flash) |
| `fallback.ts` | Static Markdown projection of the same AST |
| `statements.ts` | `{@body}` statement splitting and `DIL.useState` slot discovery |
| `index.ts` | `parseDocument`, re-exports |

### What it parses

1. **Prose + DIL mixed at the top level.** Fenced blocks (` ``` `, `~~~`, `$$`, `\[`),
   inline code (`` ` ``) and raw-text elements (`<code>`, `<pre>`, `<code-block>`) are
   opaque: `<box>` or `{#each}` inside them stays literal text.
2. **Layout, typography, lists, tables, SVG nodes.** Tags are taken as written — the
   parser has no component vocabulary; `src/components/dil` owns the rendering catalog.
   Indentation is layout, not code: there is no indented code block in the grammar, so a
   four-space line inside a `<box>` is prose and code is always fenced.
3. **Attribute forms.** `border` (= true), `radius="xl"`, `padding={3}`,
   `padding={{x: 2, y: 1}}`, `onClick={() => …}` (a `>` inside `{}` never closes the tag).
4. **Markdown lowering, two tiers.** Document-level `BlockProse` uses the same GFM lexer
   the transcript renders with: headings → `title`, paragraphs → `text`, `-`/`1.`
   (nested, `start`) → `list`/`list-item`, GFM tables → `table`/`table-row`/`table-cell`
   (`header` on row 0), `>` → `blockquote`, `---` → `divider`, `~~x~~` → `text
   lineThrough`, task lists → `☑`/`☐`. Element-interior `InlineFlow` uses `inline.ts`
   only. Fences reach the same vocabulary as `code-block`/`math`. Inline math is the
   exception: `$…$` and `\(…\)` become `<math>` in `parser.ts`, because micromark would
   read `\(` as an escape and `$20 … $` as LaTeX. Two micromark constructs are off:
   `codeIndented` (indentation is layout) and `setextUnderline` (a lone `-` or `=` under a
   streamed paragraph is a list item or an underline starting, not an H2).
5. **Control flow and state declarations.** `{#if}` / `{:else if}` / `{:else}`,
   `{#each xs as x, i}`, `{@body …}` — parsed, but not evaluated here.

### Streaming recovery

The parser never throws: a truncated document is the normal case, not an error. Each
failure is recorded as a `DilDiagnostic` and parsing continues with a best-effort AST.

| Diagnostic | Trigger | AST action |
| --- | --- | --- |
| `unclosed_tag` | `</box>` missing at EOF or at the parent's close | keep the node, `closed: false` |
| `unterminated_tag` | opening tag reaches EOF without `>` / `/>` | drop the node (no half-tag flash) |
| `unterminated_braced_value` | `{`, `{#…` or `={…` never closes | `{expr}` falls back to an incomplete expr; `{@body` inside one line is recovered at EOL |
| `unclosed_block` | `{/if}` / `{/each}` missing | keep the block, closed by the parent |
| `incomplete_source` | fence or math block reaches EOF | keep the raw text |
| `mismatched_tag` / `mismatched_block_close` | `</div>` for `<box>`, `{/each}` for `{#if}` | close the matching ancestor, else drop the stray close |
| `unexpected_terminator` | `{/if}` at the document level | drop it |
| `unknown_block` / `unknown_directive` | `{#while}` / `{@style}` | drop the construct |
| `malformed_each` / `malformed_terminator` / `malformed_attribute` / `unterminated_string` / `empty_app_directive` | malformed clause | recover with defaults (`[]`, `item`) |

`pruneEmptyIncomplete` then removes unclosed **empty** containers (`box`, `row`, `grid`,
`list-item`, `table-cell`, …) — the frame that would otherwise flash as an empty box
while tokens stream in.

### Stream repair

A prefix is not only structurally incomplete, it is also *lexically* incomplete: `**LLM
Encoder` is not an error, it is two literal asterisks, so a streaming answer flashes `**`
for a few frames. ChatGPT's transcripts (`data/streams`, Frame 29 `**LLM Encoder…`, Frame
126 `    **CL`) compile that tail to `<bold>` immediately; `stream-repair.ts` does the
same before the prose reaches the lexer, for the one fragment that still owns the end of
the source (`pos + length === source.length`):

| tail | repaired to | because |
| --- | --- | --- |
| `**LLM Encoder` | `**LLM Encoder**` | an opener that hugs a non-space character is emphasis, not punctuation |
| `` `192.168.1.1 `` | `` `192.168.1.1` `` | one backtick run; a run of three or more is a fence and is left to `parser.ts` |
| `~~删` | `~~删~~` | same rule, `lineThrough` |
| `[文档](https://exa` | `文档` | a half-received target would render as `(https://…`; the label is what a reader keeps |
| `a * b`, `20~25` | unchanged | not an opener: a space follows, so it is a multiplication sign |
| earlier paragraphs | unchanged | only the tail is active; a finished paragraph keeps its bytes |

Both prose tiers share the implementation, so `<box>**CL` and `**CL` lower the same way.

### Tests & snapshots

```bash
npm run test:dil                 # node --test, no dependencies
npm run test:dil:update          # regenerate the golden snapshots
DIL_CORPUS_DIR=/path/to/dil npm run test:dil   # also parse a real *.dil.md corpus
```

Standalone DIL case inputs use the `.dil.md` suffix (`__fixtures__/*.dil.md`). Each one
is a small scenario, so its whole snapshot stays reviewable:

| fixture | what it covers |
| --- | --- |
| `prose-blocks` | document-tier Markdown: heading, table, quote, list, math, fence, link, rule |
| `layout-metrics` | `box`/`row`/`grid`/`grid-item`, typography, interpolation, one state slot |
| `inline-flow` | element-interior `InlineRun`: bold/italic/code/strike, blank-line paragraphs |
| `control-flow` | `{@body}` state, `{#each}` with index, `{#if}`/`{:else}`, `button` |
| `svg-grid` | parametric SVG: nested `{#each}`, arithmetic attributes, `defs`/`marker` |
| `streaming-cut` | a document truncated mid-tag: the recovery shape |

Every fixture has a committed snapshot under `__snapshots__/`:

```
<name>.tree.json      state + diagnostics + the lowered render tree
<name>.fallback.md    the Markdown projection, readable as prose
```

The tree is a compact projection, not raw AST JSON: a text run is just `"文字"`, a small
subtree stays on one line, attributes read as `{"gap": {"expr": "2"}, "border": true}`.
Offsets (`pos`/`end`) and internal flags (`synthetic`) are omitted because they are noise
for review; a separate test asserts offsets stay inside the source. Review the diff, then
either keep it or fix the regression.

The suite also covers the grammar, every recovery rule, both prose tiers, the fallback
projection, and two properties that matter for streaming: **every prefix of a document
parses without throwing**, and parsing is deterministic. A parity test keeps the
document-tier GFM lexer and the element-tier `InlineRun` agreeing on the inline subset
(`**bold**`, `*italic*`, `~~strike~~`, code, links, autolinks, entities, escapes). The optional `DIL_CORPUS_DIR`
run parses real ChatGPT DIL samples (e.g.
`/Users/xieziheng/projects/generative-ui-research/dil`, whose captures are still named
`*.source.md`); truncated samples there are expected to report diagnostics, so it
asserts on the clean ratio rather than zero.

## Non-goals (deliberate)

- **No JavaScript evaluation.** `{expr}` and `{@body}` are kept as source text. Safe
  expression evaluation is issue #47; implicit-state repair and the
  `GenUI.*` host bridge are issue #48.
- **No ```` ```genui ```` unwrapping.** Per `dil.ebnf`, a fenced block is raw text. If a
  surface decides to accept a fenced DIL wrapper, it must strip the fence lines before
  calling `parseDocument`.
- **No React or DOM.** `src/components/dil` maps this AST onto the design system.

## Roadmap

- **Phase 1 ([#46](https://github.com/kkkiio/pi-web-ui/issues/46))**: spatial/relational
  layout tags, typography, lists/tables, unified Markdown lowering — **parser side done**;
  the React renderer in `src/components/dil` is what remains.
- **Phase 2 ([#47](https://github.com/kkkiio/pi-web-ui/issues/47))**: `__dilSafe`
  evaluator for `{#each}` / `{#if}` and parametric `<svg>`.
- **Phase 3 ([#48](https://github.com/kkkiio/pi-web-ui/issues/48))**: `DIL.useState`,
  interactive controls, implicit-state repair, `GenUI.issueNewTurn` host bridge.
