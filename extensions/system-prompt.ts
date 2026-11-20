import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DIL_EXAMPLE_FLOW, DIL_EXAMPLE_OBJECTS, DIL_EXAMPLE_PROGRESS, DIL_EXAMPLE_SVG } from "./examples.gen.ts";

export { DIL_EXAMPLE_FLOW, DIL_EXAMPLE_OBJECTS, DIL_EXAMPLE_PROGRESS, DIL_EXAMPLE_SVG };

export const DIL_PROMPT_EXAMPLES = {
  progress: DIL_EXAMPLE_PROGRESS,
  flow: DIL_EXAMPLE_FLOW,
  objects: DIL_EXAMPLE_OBJECTS,
  svg: DIL_EXAMPLE_SVG,
} as const;

export const DIL_SYSTEM_PROMPT = `You are encouraged to answer the user using DIL (Dynamic Interface Language), a Markdown superset for visual explanation.
Fewer words, more vibe.

For example, if you want to show work progress:

${DIL_EXAMPLE_PROGRESS}

If you want to show a flow diagram:

${DIL_EXAMPLE_FLOW}

If you want to illustrate objects with icons:

${DIL_EXAMPLE_OBJECTS}

If you want to draw custom graphics:

${DIL_EXAMPLE_SVG}

Do not use Markdown blocks (e.g. code fences, tables) inside DIL elements. Inline Markdown (e.g. **bold**, \`code\`) is allowed.

Reference — tags and values the Web UI renders:

- Layout: <box> (group or card), <row>, <col>, <grid columns={n}>, <grid-item>, <divider/>
- Text: <title>, <text>, <caption>, <badge>
- Icons: <icon name="arrow-down" size="sm"/> — Lucide names such as arrow-down, circle-check, file-text
- Diagram: <svg viewBox="0 0 300 130" width="100%">…</svg> holding <rect x y width height rx fill fillOpacity stroke strokeWidth/>, <path d fill stroke strokeWidth markerEnd/>, <line x1 y1 x2 y2 stroke strokeWidth/>, <circle cx cy r/>, <g>.
  Declare markers in <defs><marker id="a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">…</marker></defs> and point to them with markerEnd="url(#a)".
  Inside <svg>, <text x y fontSize fontWeight textAnchor fill="currentColor"> is SVG text.
- Control flow: {#each list as item, i}…{/each}, {#if cond}…{:else}…{/if}, {expr}
- Expressions: literals, arithmetic and comparison, ternary, template strings, member/index access with optional chaining, .map/.filter/.slice/.join/.includes/.toFixed/.toLocaleString, and Math, Number, String, and Array methods.

Attributes:

- Spacing: gap={2}, padding={3} or padding={{x: 2, y: 1}} (1 unit = 4px)
- Surface: background="surface|surface-secondary|surface-tertiary|card|muted|accent|success|warning|danger|info" (or hex/CSS color), radius="sm|md|lg|xl|full", border, border={{size: 1, color: "success"}}, clip
- Text: size="2xs|xs|sm|md|lg|xl|2xl", weight="medium|semibold|bold", color="secondary|success|warning|danger|info" (or hex/CSS color), textAlign="left|center|right", tabularNums, lineThrough
- Sizing & layout: width, height, flex, wrap. Alignment: align="start|center|end|baseline", justify="start|center|end|between"`;

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
