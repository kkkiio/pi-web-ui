/**
 * DIL activation for Pi Web UI.
 *
 * While the Web UI is enabled, Pi's system prompt carries one extra section:
 *
 *     <dil>
 *     Pi Web UI supports DIL (Dynamic Interface Language), a superset of Markdown …
 *     </dil>
 *
 * It is added through `before_agent_start` by mutating `systemPromptOptions.sections`, so
 * Pi diffs it against the sections the transcript already has and sends one small patch
 * instead of rewriting the prompt head — the provider's cached prefix survives. Deactivation
 * removes it the same way (`null`).
 *
 * Scope follows ADR 0013: nothing is injected before `/webui`, and everything is released
 * when the server stops or the session is replaced.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DIL_SYSTEM_PROMPT } from "./dil-system-prompt";

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
