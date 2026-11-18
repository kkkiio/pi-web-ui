# `src/components/dil` — DIL React Renderer & Primitive Catalog

React renderer and component catalog that maps the unified DIL AST from [`src/core/dil`](../../core/dil/README.md) into Pi Web UI's design system (`shadcn/ui`, Tailwind CSS v4, Lucide icons, Shiki code blocks, and KaTeX math).

## Positioning & Responsibilities

1. **AST-to-React Coordinator (`dil-renderer.tsx`)**:
   - Renders the parsed DIL AST into React elements without `eval` or direct DOM mutation.
   - Manages per-message reactive state slots (`DIL.useState`) and connects `GenUI.issueNewTurn(prompt)` / `GenUI.openUrl(url)` to Pi Web UI's session composer and transport.
2. **Design Token Mapping (`tokens.ts`)**:
   - Maps DIL layout and semantic tokens (`background="surface-secondary"`, `radius="xl"`, `padding={{x: 3, y: 2}}`, `color="success"`, `tabularNums`) to Pi Web UI's light/dark Tailwind classes.
3. **Primitive Component Catalog (`primitives/`)**:
   - `layout.tsx` — `box`, `row`, `col`, `grid`, `grid-item`, `divider`
   - `typography.tsx` — `title`, `text`, `caption`, `badge`, `icon` (Lucide), `bold`, `italic`, `code`, `blockquote`, `Link`
   - `data.tsx` — `list` (including `connector="solid"` step timelines), `list-item`, `table`, `table-row`, `table-cell`
   - `rich-blocks.tsx` — `code-block` (reusing Shiki syntax highlighting), `math` (KaTeX), `mermaid`
   - `svg.tsx` — Parametric inline SVG nodes (`svg`, `defs`, `marker`, `rect`, `path`, `text`)
   - `controls.tsx` — Interactive controls (`button`, `radio-group`, `radio`, `textarea`, `label`)
