# `src/components/dil` — DIL React Renderer & Primitive Catalog

React renderer and component catalog that maps the unified DIL AST from [`src/core/dil`](../../core/dil/README.md) into Pi Web UI's design system (`shadcn/ui`, Tailwind CSS v4, Lucide icons, Shiki code blocks, and KaTeX math).

## Positioning & Responsibilities

1. **AST-to-React Coordinator (`dil-renderer.tsx`)**:
   - `<DilRenderer source isStreaming />` runs the whole loop: throttle → `parseDocument` →
     `evaluateStatements` + `resolveNodes` → JSX. No `eval`, no direct DOM mutation.
   - Expansion of `{#each}` / `{#if}` / `{expr}` happens in `resolve.ts` **before** React
     sees anything, so components only render resolved elements and text.
2. **Design Token Mapping (`tokens.ts`)**:
   - Maps DIL tokens (`padding`, `gap`, `radius`, `background`, `border`, `color`, `size`,
     `weight`, `align`, `justify`, `tabularNums`, `columns`, …) to Tailwind classes and a
     small inline `style` for numeric geometry. Values that are not a number, a CSS length
     or a plain colour are dropped rather than forwarded.
3. **Primitive Component Catalog (`primitives/`)** — what exists today:
   - `layout.tsx` — `box`, `row`, `col`, `grid`, `grid-item`, `divider` (#46)
   - `typography.tsx` — `title`, `text`, `caption`, `badge`, `icon` (Lucide, unknown names
     fall back to a dot), `bold`, `italic`, `code` (#46)
   - `content.tsx` — readable fallbacks for the slices that follow: `list`/`list-item`,
     `table`/`table-row`/`table-cell`, `blockquote`, `Link`, `math`, `code-block` (#49),
     plus memoized `MathLeaf`/`CodeBlockLeaf` leaves. SVG leaves (#47) render nothing yet.

## Streaming updates & caching

A DIL answer arrives token by token, so the renderer re-renders the same message dozens
of times. The update strategy is deliberately boring:

> **Throttled full parse + `React.memo` on heavy leaves.** No block-level incremental
> parse, no `reuseParsedBlocks`, no `stableLength`.

### Why not a Streamdown-style block cache

`streamdown` keeps finished Markdown blocks and re-parses only the tail
(`reuseParsedBlocks` + `stableLength`). DIL does not take that route, for three reasons:

1. **Parsing the whole document is already cheap.** `parseDocument(text)` costs ~1 ms in
   V8 for a full message (measured on the corpus fixtures in Node, `src/core/dil`). At a
   ~60 ms throttle that is a low single-digit percentage of wall time — far less than the
   bookkeeping a cache needs.
2. **Top-level blocks are not the boundaries that matter.** A `<box>`/`<row>`/`<grid>` in
   a DIL answer routinely spans most of the message, and while streaming the outermost
   container is *unclosed* (`closed: false`). A cache keyed on top-level blank-line blocks
   would invalidate one giant chunk on nearly every tick and still have to model the
   identity of half-open nodes.
3. **The prefix is not a stable prefix.** Repair rewrites the tail: `**LLM` is plain text
   until `src/core/dil/stream-repair.ts` closes it into `<bold>`, and a newline can turn a
   paragraph into a list item. `stableLength` assumes earlier nodes never change; for DIL
   the opposite is the normal case, and honouring the assumption means two parsers can
   disagree about the same bytes — exactly the state-misalignment bug this decision exists
   to avoid.
4. **The text is the only source of truth.** `parseDocument` is a pure function of the
   string, so a full re-parse can never render a stale tree, and a dropped tick can never
   diverge from the transcript.

### The rule

1. **Throttle incoming text to 50–80 ms (default 60 ms)** while `isStreaming === true`,
   trailing edge: the newest chunk always schedules a parse.
2. **When `isStreaming` flips to `false`, parse immediately and synchronously.** Cancel any
   pending timer, parse the final text, render it — the last tokens must never wait for a
   throttle window.
3. **Call `parseDocument(text)` on the full text** at each tick. The throttle is the only
   cache: keep the last `{ tree, diagnostics }` in state, nothing else.
4. **Let React reconcile ordinary nodes.** `box`, `row`, `col`, `grid`, `text`, `list`,
   `table`, `svg` … are cheap VDOM nodes; diffing them is cheaper than any per-node memo
   bookkeeping. Do not memo them.
5. Keep the throttle **in the renderer** (`src/web/src/components/dil/`), not in
   `src/core/dil`: the parser stays a pure, Node-testable function.

### What to memo

Only leaves whose render is expensive and whose inputs are primitives. Pass those
primitives as props and use a default `React.memo` shallow compare — every parse produces
fresh node objects, so a comparator that compares node identity would always miss.

| component | memoized props | while streaming |
| --- | --- | --- |
| `CodeBlock` (Shiki) | `code`, `language`, `closed` | render a plain `<pre>` until `closed` (the fence arrived), then highlight once |
| `Math` (KaTeX) | `value`, `block`, `closed` | same: plain text until the block math closes |
| `Mermaid` | `code`, `closed` | render only when `closed` |

That is the whole cache: a closed `<code-block>` re-renders with identical primitive props
after every tick and is skipped by `React.memo`, so Shiki/KaTeX/Mermaid never re-highlight
a block that has already finished.

### Non-goals

- No `parseIncompleteMarkdown` style toggle: stream repair is part of `parseDocument`
  (`src/core/dil/stream-repair.ts`) and always applies to the tail.
- No `parsePrefix`/incremental parser API, no AST virtualization, no per-node memo.

## Safety

Expressions are evaluated by [`src/core/dil/evaluator.ts`](../../core/dil/evaluator.ts),
never by `eval` or `new Function`. The renderer only decides *which* expression to hand
over and *what a failure looks like*:

- `{#if cond}` → false, `{#each list as x}` → `[]`, `{expr}` and attributes → absent;
  one broken expression never removes its siblings (the `__dilSafe` contract).
- Links render as anchors only for `http(s):` and `mailto:` (`safeLinkUrl`); anything else
  shows its label as text.
- `on*` attributes are not wired up in #46: `onClick={() => …}` evaluates to an inert
  closure value that the primitives ignore. Interaction is #48.

## Where #46 stops

`<DilRenderer>` is the end-to-end path (`parseDocument` → evaluator → primitives) and is
what the message view will mount. The labels below are deliberately not rendered yet,
because each is a slice of its own:

| tag | today | slice |
| --- | --- | --- |
| `table`, `list`, `blockquote`, `Link`, `math`, `code-block` | plain HTML fallbacks; `math`/`code-block` are memoized leaves | #49 |
| `svg`, `defs`, `marker`, `rect`, `path`, … | skipped (their leaves are geometry, not prose) | #47 |
| `button`, `radio-group`, `radio`, `textarea`, `label` | children only; no handlers | #48 |

## Roadmap

- **[#46 Core MVP](https://github.com/kkkiio/pi-web-ui/issues/46)** — layout primitives,
  typography, throttled render + safe evaluation. **Done in this package.**
- **[#49 Document & data primitives](https://github.com/kkkiio/pi-web-ui/issues/49)** —
  styled `list`/`table`/`blockquote`/`Link`, Shiki `code-block`, KaTeX `math`.
  Fallbacks exist; replace their bodies, keep the leaf memo keys (`code`, `language`,
  `closed` / `value`, `block`).
- **[#47 Parametric SVG](https://github.com/kkkiio/pi-web-ui/issues/47)** — `svg` +
  `defs`/`marker`/`rect`/`path`/`text` with DIL attributes.
- **[#48 State & interaction](https://github.com/kkkiio/pi-web-ui/issues/48)** —
  `DIL.useState` setters (the evaluator already binds initials and an inert setter),
  form controls, `GenUI.issueNewTurn`.
