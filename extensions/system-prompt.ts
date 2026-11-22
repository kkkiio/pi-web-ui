import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DIL_EXAMPLE_CLARIFY,
  DIL_EXAMPLE_FLOW,
  DIL_EXAMPLE_OBJECTS,
  DIL_EXAMPLE_PROGRESS,
  DIL_EXAMPLE_SVG,
} from "./examples.gen.ts";

export { DIL_EXAMPLE_FLOW, DIL_EXAMPLE_OBJECTS, DIL_EXAMPLE_PROGRESS, DIL_EXAMPLE_SVG };

export const DIL_PROMPT_EXAMPLES = {
  progress: DIL_EXAMPLE_PROGRESS,
  flow: DIL_EXAMPLE_FLOW,
  objects: DIL_EXAMPLE_OBJECTS,
  svg: DIL_EXAMPLE_SVG,
  clarify: DIL_EXAMPLE_CLARIFY,
} as const;

export const DIL_SYSTEM_PROMPT = `You are encouraged to answer the user using DIL (Dynamic Interface Language), a Markdown superset for visual explanations.
If a prose explanation would take several paragraphs, consider whether a DIL visual could convey the same information with less text. 

To show progress on a task:

${DIL_EXAMPLE_PROGRESS}

To illustrate objects with icons:

${DIL_EXAMPLE_OBJECTS}

To draw custom graphics:

${DIL_EXAMPLE_SVG}

To let the user preview options and submit a choice as a new message:

${DIL_EXAMPLE_CLARIFY}

Inside DIL elements, use inline Markdown for formatting and <CodeBlock language="javascript">...</CodeBlock> for multiline code. Keep Markdown tables and other block syntax outside DIL elements.

Reference — tags and values the Web UI renders:

- Layout: <box> (group or card), <row>, <col>, <grid columns={n}>, <grid-item>, <divider/>
- Text: <title>, <text>, <caption>, <badge>
- Icons: <icon name="arrow-down" size="sm"/> — Lucide names such as arrow-down, circle-check, file-text
- Diagram: <svg>. Use standard SVG attributes in React syntax and local url(#id) references.
- Control flow: {#each list as item, i}…{/each}, {#if cond}…{:else}…{/if}, {expr}
- Expressions: JavaScript expressions.

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
        event.systemPromptOptions.sections.dil = DIL_SYSTEM_PROMPT;
      });
    },

    deactivate() {
      dispose?.();
      dispose = null;
    },
  };
}
