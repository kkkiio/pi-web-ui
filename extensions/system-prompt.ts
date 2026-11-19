/**
 * The DIL contract Pi Web UI adds to Pi's system prompt.
 *
 * Kept as a standalone module for readability: this text is product copy, not code. It
 * is injected as a `<dil>` section through `before_agent_start` (see `dil-prompt.ts`), so
 * Pi diffs it into one mid-conversation system patch instead of rewriting the prompt head.
 *
 * Shape is taught by the examples first (parsed by a test), and the tag and attribute
 * tables follow as reference; they stay because a closed vocabulary cannot be inferred —
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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DIL_EXAMPLE_FLOW, DIL_EXAMPLE_OBJECTS, DIL_EXAMPLE_PROGRESS, DIL_EXAMPLE_SVG } from "./examples.gen.ts";

export { DIL_EXAMPLE_FLOW, DIL_EXAMPLE_OBJECTS, DIL_EXAMPLE_PROGRESS, DIL_EXAMPLE_SVG };

export const DIL_PROMPT_EXAMPLES = {
  progress: DIL_EXAMPLE_PROGRESS,
  flow: DIL_EXAMPLE_FLOW,
  objects: DIL_EXAMPLE_OBJECTS,
  svg: DIL_EXAMPLE_SVG,
} as const;

export const DIL_SYSTEM_PROMPT = `You are encouraged to answer user using DIL (Dynamic Interface Language), a Markdown superset for visual explanation.
Less words, more vibe.

For example, if you want to describe progress of works:

${DIL_EXAMPLE_PROGRESS}

If you want to describe flow diagram:

${DIL_EXAMPLE_FLOW}

If you want to mention objects with their graphics or icons:

${DIL_EXAMPLE_OBJECTS}

If you want to draw some custom graphics:

${DIL_EXAMPLE_SVG}

Reference — every tag and value the Web UI renders:

- Layout: <box> (group or card), <row>, <col>, <grid columns={n}>, <grid-item>, <divider/>
- Text: <title>, <text>, <caption>, <badge>
- Icons: <icon name="arrow-down" size="sm"/> — lucide names such as arrow-down, check-circle, file-text
- Diagram: <svg viewBox="0 0 300 130" width="100%">…</svg> holding <rect x y width height rx fill/>, <path d stroke markerEnd/>, <line x1 y1 x2 y2/>, <circle cx cy r/>, <g>. Declare markers in <defs><marker id="a" markerWidth="6" refX="5" orient="auto">…</marker></defs> and point to them with markerEnd="url(#a)". Inside <svg>, <text x y fontSize textAnchor fill> is SVG text, not the typography tag.
- Control flow: {#each list as item, i}…{/each}, {#if cond}…{:else}…{/if}, {expr}
- Expressions: literals, arithmetic and comparison, ternary, template strings, member/index access with optional chaining, .map/.filter/.slice/.join/.includes/.toFixed/.toLocaleString, and the Math/Number/String/Array allowlist.

Attributes:

- Spacing: gap={2}, padding={3} or padding={{x: 2, y: 1}} (1 unit = 4px)
- Surface: background="surface|surface-secondary|surface-tertiary|card|muted|accent|success|warning|danger|info", radius="sm|md|lg|xl|full", border, border={{size: 1, color: "success"}}
- Text: size="2xs|xs|sm|md|lg|xl|2xl", weight="medium|semibold|bold", color="secondary|success|warning|danger", textAlign, tabularNums
- Sizing: width, height, flex. Alignment: align="center|start|baseline", justify="between|center"`;

export interface DilPromptController {
  activate(): void;
  deactivate(): void;
  readonly active: boolean;
}

export function createDilPrompt(pi: ExtensionAPI): DilPromptController {
  let dispose: (() => void) | null = null;

  return {
    get active() {
      return dispose !== null;
    },

    activate() {
      if (dispose) return;
      dispose = pi.on("before_agent_start", async (event) => {
        // Section names must match /^[a-z][a-z0-9_-]*$/; `dil` is rendered as `<dil>…</dil>`.
        event.systemPromptOptions.sections.dil = DIL_SYSTEM_PROMPT;
      });
    },

    deactivate() {
      dispose?.();
      dispose = null;
    },
  };
}
