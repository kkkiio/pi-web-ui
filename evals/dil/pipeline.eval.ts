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
import { DIL_CASES, DIL_SYSTEM_PROMPT } from "./cases.ts";
import { scoreCase } from "./scoring.ts";

const PROVIDER = process.env.DIL_EVAL_PROVIDER ?? "deepseek";
const MODEL = process.env.DIL_EVAL_MODEL ?? "deepseek-flash";

const configured = (() => {
  try {
    apiKeyFor(PROVIDER);
    return true;
  } catch {
    return false;
  }
})();

const harness = createHarness<string, { text: string; systemPrompt: string }>({
  name: `${PROVIDER}/${MODEL}`,
  async run({ input }) {
    const agent = await createDilAgent({ provider: PROVIDER, model: MODEL });
    const result = await agent.run(input, DIL_SYSTEM_PROMPT);
    return {
      output: result,
      messages: [
        { role: "user", content: input },
        { role: "assistant", content: result.text },
      ],
      usage: { provider: PROVIDER, model: MODEL },
    };
  },
});

describeEval("DIL output", { harness }, (it) => {
  for (const dilCase of DIL_CASES) {
    it.skipIf(!configured)(`${dilCase.id}: ${dilCase.category}`, async ({ run }) => {
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
