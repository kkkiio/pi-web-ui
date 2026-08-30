import type { ModelInfo } from "./types";

/**
 * Thinking levels supported by a model, aligned with pi's own algorithm
 * (pi/packages/ai/src/models.ts → getSupportedThinkingLevels):
 * - non-reasoning models only get "off"
 * - "xhigh"/"max" require an explicit thinkingLevelMap entry
 * - levels mapped to null are unsupported
 */
export const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export function getSupportedThinkingLevels(model: ModelInfo | null | undefined): string[] {
  if (!model) return [...EXTENDED_THINKING_LEVELS];
  if (!model.reasoning) return ["off"];
  return EXTENDED_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}
