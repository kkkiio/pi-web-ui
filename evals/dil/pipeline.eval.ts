/**
 * Live DIL eval through `vitest-evals`.
 *
 * Same cases and same `parseDocument` scoring as the CLI runner, but expressed as a
 * harness-backed Vitest suite so failures read like tests, retries and filtering are
 * Vitest's, and judges / reporters / replay become available without our own plumbing.
 *
 *   npm run eval:dil:vitest
 *   npx vitest run --config vitest.evals.config.ts evals/dil/pipeline.eval.ts -t flow
 *
 * Skipped when no model credential is configured.
 */

import { expect } from "vitest";
import { createHarness, describeEval } from "vitest-evals";
import { apiKeyFor, createDilAgent } from "./agent.ts";
import { DIL_CASES } from "./cases.ts";
import { scoreCase } from "./scoring.ts";

const PROVIDER = process.env.DIL_EVAL_PROVIDER ?? "deepseek";

/**
 * `DIL_EVAL_MODELS="opencode-go/deepseek-v4.1-flash,opencode-go/glm-5.3"` runs the whole
 * suite once per model, so one Vitest JSON holds every model's specs and artifacts.
 */
const MODELS = (process.env.DIL_EVAL_MODELS ?? `${PROVIDER}/${process.env.DIL_EVAL_MODEL ?? "deepseek-flash"}`)
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [provider, ...rest] = entry.split("/");
    return rest.length > 0 ? { provider, id: rest.join("/") } : { provider: PROVIDER, id: entry };
  });

function configuredFor(provider: string): boolean {
  try {
    apiKeyFor(provider);
    return true;
  } catch {
    return false;
  }
}

for (const model of MODELS) {
  const harness = createHarness<string, { text: string; systemPrompt: string }>({
    name: `${model.provider}/${model.id}`,
    async run({ input }) {
      const agent = await createDilAgent({ provider: model.provider, model: model.id });
      const result = await agent.run(input);
      return {
        output: result,
        messages: [
          { role: "user", content: input },
          { role: "assistant", content: result.text },
        ],
        usage: { provider: model.provider, model: model.id },
      };
    },
  });

  describeEval(`DIL output — ${model.provider}/${model.id}`, { harness }, (it) => {
    for (const dilCase of DIL_CASES) {
      it.skipIf(!configuredFor(model.provider))(`${dilCase.id}: ${dilCase.category}`, async ({ run }) => {
        const result = await run(dilCase.prompt);
        const scored = scoreCase(dilCase, result.output.text);
        expect(result.output.systemPrompt).toContain("<dil>");
        const missed = scored.checks.filter((check) => !check.pass).map((check) => check.label);
        const preview = result.output.text.slice(0, 400);
        expect(missed, `${scored.score}% — parse: ${scored.diagnostics}\n--- model output ---\n${preview}`).toEqual([]);
        expect(scored.diagnostics).toBe("clean");
      });
    }
  });
}
