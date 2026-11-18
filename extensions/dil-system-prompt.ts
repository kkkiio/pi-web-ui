/**
 * The DIL contract Pi Web UI adds to Pi's system prompt.
 *
 * Kept as a standalone module for readability: this text is product copy, not code. It
 * is injected as a `<dil>` section through `before_agent_start` (see `dil-prompt.ts`), so
 * Pi diffs it into one mid-conversation system patch instead of rewriting the prompt head.
 *
 * Only tags the renderer actually implements are listed (#46 vocabulary). Markdown keeps
 * owning prose, lists, tables and code blocks; `#49`/`#47`/`#48` primitives are deliberately
 * absent so the model is not told to emit markup that still renders as a fallback.
 */

export const DIL_SYSTEM_PROMPT = `Pi Web UI supports DIL (Dynamic Interface Language), a superset of Markdown for spatial relationships that prose describes poorly: side-by-side comparison, containment, flow, proportions, and state distribution.

How to use it:
- Keep ordinary paragraphs, lists, tables, and fenced code in Markdown.
- When the reader must see at a glance what contains what, what sits side by side, how much each part takes, or how a request flows, use the containers and components below. Close every tag.
- Output DIL directly. Do not wrap it in a code fence.

Tags:
- Layout: <box> (group or card), <row>, <col>, <grid columns={n}>, <grid-item>, <divider/>
- Text: <title>, <text>, <caption>, <badge>, <bold>, <italic>, <code>
- Icons: <icon name="arrow-down" size="sm"/> — lucide names such as arrow-down, check-circle, file-text
- Control flow: {#each list as item, i}…{/each}, {#if cond}…{:else}…{/if}, {expr}
- Expressions: literals, arithmetic and comparison, ternary, template strings, member/index access with optional chaining, .map/.filter/.slice/.join/.includes/.toFixed/.toLocaleString, and the Math/Number/String/Array allowlist.

Attributes:
- Spacing: gap={2}, padding={3} or padding={{x: 2, y: 1}} (1 unit = 4px)
- Surface: background="surface|surface-secondary|surface-tertiary", radius="sm|md|lg|xl|full", border, border={{size: 1, color: "success"}}
- Text: size="2xs|xs|sm|md|lg|xl|2xl", weight="medium|semibold|bold", color="secondary|success|warning|danger", textAlign, tabularNums
- Sizing: width, height, flex. Alignment: align="center|start|baseline", justify="between|center"

Example:

<box gap={2} padding={3} background="surface-secondary" radius="lg">
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
