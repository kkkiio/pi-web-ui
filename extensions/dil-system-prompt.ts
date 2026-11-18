/**
 * The DIL contract Pi Web UI adds to Pi's system prompt.
 *
 * Kept as a standalone module for readability: this text is product copy, not code. It
 * is injected as a `<dil>` section through `before_agent_start` (see `dil-prompt.ts`), so
 * Pi diffs it into one mid-conversation system patch instead of rewriting the prompt head.
 *
 * Shape is taught by example (`dil-prompt-examples.ts`, parsed by a test); the tag and
 * attribute lines stay because a closed vocabulary cannot be inferred from two examples —
 * models otherwise invent `size="small"` or `color="muted"`, which the token map drops
 * silently. Only tags the renderer implements are listed (#46 vocabulary); `#49`/`#47`/`#48`
 * primitives are deliberately absent so the model is not told to emit markup that still
 * renders as a fallback.
 */

/**
 * The examples the prompt shows, kept next to it so they can be parsed by a test: an
 * example that does not parse is worse than none, because the model copies it verbatim.
 *
 * `proportions` — repeated row with a proportional bar (`{#each}` + expression attribute).
 * `containment` — a flow whose hop has an inner box, with arrow and badge annotation.
 * `svg` — parametric geometry: nested `{#each}`, arithmetic coordinates, a marker.
 */

export const DIL_EXAMPLE_PROPORTIONS = `<box gap={2} padding={3} background="surface-secondary" radius="lg">
  <text weight="semibold">Request path</text>
  {#each [{ label: "Browser", p: 62 }, { label: "mirror-server", p: 28 }] as hop}
    <row justify="between" align="center" gap={2}>
      <caption>{hop.label}</caption>
      <text tabularNums>{hop.p}%</text>
    </row>
    <box height="8px" radius="full" background="surface-tertiary">
      <box height="100%" radius="full" width={\`\${hop.p}%\`} background="surface"/>
    </box>
  {/each}
</box>`;

export const DIL_EXAMPLE_CONTAINMENT = `<box gap={2} padding={3} border radius="lg">
  <title>Write path</title>
  <row gap={2} align="center">
    <badge color="success">browser</badge>
    <icon name="arrow-right" size="xs"/>
    <box padding={{ x: 2, y: 1 }} background="surface-secondary" radius="md">
      <caption>mirror-server</caption>
    </box>
    <icon name="arrow-right" size="xs"/>
    <badge color="warning">pi session</badge>
  </row>
  <caption>A caption can say what the shape means.</caption>
</box>`;

export const DIL_EXAMPLE_SVG = `<svg viewBox="0 0 300 130" width="100%">
  <defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0 0 L6 3 L0 6 Z" fill="currentColor"/>
    </marker>
  </defs>
  {#each Array.from({ length: 4 }) as r}
    {#each Array.from({ length: 8 }) as c}
      <rect x={30 + c * 32} y={10 + r * 24} width="28" height="20" rx="3" fill={c % 2 === 0 ? "#83b4e2" : "#abcbed"} fillOpacity=".85"/>
    {/each}
  {/each}
  <line x1="20" y1="108" x2="280" y2="108" stroke="currentColor" markerEnd="url(#arrow)"/>
  <text x="150" y="124" fontSize="9" textAnchor="middle" fill="currentColor">4 × 8 tiles</text>
</svg>`;

export const DIL_PROMPT_EXAMPLES = {
  proportions: DIL_EXAMPLE_PROPORTIONS,
  containment: DIL_EXAMPLE_CONTAINMENT,
  svg: DIL_EXAMPLE_SVG,
} as const;

export const DIL_SYSTEM_PROMPT = `Pi Web UI supports DIL (Dynamic Interface Language), a Markdown superset for what prose describes badly: containment, side-by-side comparison, flow, proportions.

Keep paragraphs, lists, tables and fenced code in Markdown. Put spatial structure in DIL, output it directly (no code fence), and close every tag.

Tags:
- Layout: <box> (group or card), <row>, <col>, <grid columns={n}>, <grid-item>, <divider/>
- Text: <title>, <text>, <caption>, <badge>, <bold>, <italic>, <code>
- Icons: <icon name="arrow-down" size="sm"/> — lucide names such as arrow-down, check-circle, file-text
- Diagram: <svg viewBox="0 0 300 130" width="100%">…</svg> holding <rect x y width height rx fill/>, <path d stroke markerEnd/>, <line x1 y1 x2 y2/>, <circle cx cy r/>, <g>. Declare markers in <defs><marker id="a" markerWidth="6" refX="5" orient="auto">…</marker></defs> and point to them with markerEnd="url(#a)". Inside <svg>, <text x y fontSize textAnchor fill> is SVG text, not the typography tag.
- Control flow: {#each list as item, i}…{/each}, {#if cond}…{:else}…{/if}, {expr}
- Expressions: literals, arithmetic and comparison, ternary, template strings, member/index access with optional chaining, .map/.filter/.slice/.join/.includes/.toFixed/.toLocaleString, and the Math/Number/String/Array allowlist.

Attributes:
- Spacing: gap={2}, padding={3} or padding={{x: 2, y: 1}} (1 unit = 4px)
- Surface: background="surface|surface-secondary|surface-tertiary|card|muted|accent|success|warning|danger|info", radius="sm|md|lg|xl|full", border, border={{size: 1, color: "success"}}
- Text: size="2xs|xs|sm|md|lg|xl|2xl", weight="medium|semibold|bold", color="secondary|success|warning|danger", textAlign, tabularNums
- Sizing: width, height, flex. Alignment: align="center|start|baseline", justify="between|center"

Three shapes:

${DIL_EXAMPLE_PROPORTIONS}

${DIL_EXAMPLE_CONTAINMENT}

${DIL_EXAMPLE_SVG}`;
