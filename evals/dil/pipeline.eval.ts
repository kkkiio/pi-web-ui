/**
 * Live DIL eval through `vitest-evals`.
 *
 * Same cases and same `parseDocument` scoring as the CLI runner, expressed as a
 * harness-backed Vitest suite so progress, concurrency, retries, and filtering come from
 * Vitest while `afterAll` persists `reports/<provider>-<model>.json` + `report.json` for
 * `just preview-eval`.
 *
 *   just eval
 *   just eval glm-5.3
 *   npx vitest run --config vitest.evals.config.ts evals/dil/pipeline.eval.ts -t flow
 *
 * Skipped when no model credential is configured.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect } from "vitest";
import { createHarness, describeEval } from "vitest-evals";
import { apiKeyFor, createDilAgent, type DilAgent } from "./agent.ts";
import { DIL_CASES } from "./cases.ts";
import { type CaseResult, scoreCase, summarize } from "./scoring.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, "report.json");
const REPORTS = join(HERE, "reports");

const PROVIDER = process.env.DIL_EVAL_PROVIDER ?? "deepseek";

/**
 * `DIL_EVAL_MODELS="deepseek-v4.1-flash,opencode-go/glm-5.3"` runs the whole suite once
 * per model (using `DIL_EVAL_PROVIDER` when no `provider/` prefix is given).
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

function writeReport(label: string, cases: readonly CaseResult[]): void {
  if (cases.length === 0) return;
  const order = new Map(DIL_CASES.map((dilCase, index) => [dilCase.id, index]));
  const ordered = [...cases].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const summary = summarize("with-dil", ordered);
  const body = `${JSON.stringify({ model: label, capturedAt: new Date().toISOString(), summary }, null, 2)}\n`;
  const slug = label.replaceAll("/", "-").replaceAll(" ", "-");
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, `${slug}.json`), body);
  writeFileSync(REPORT, body);
}

for (const model of MODELS) {
  const label = `${model.provider}/${model.id}`;
  let agentPromise: Promise<DilAgent> | null = null;
  const getAgent = () => {
    agentPromise ??= createDilAgent({ provider: model.provider, model: model.id });
    return agentPromise;
  };

  const harness = createHarness<string, { text: string; systemPrompt: string }>({
    name: label,
    async run({ input }) {
      const agent = await getAgent();
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

  describeEval(`DIL output — ${label}`, { harness }, (it) => {
    const results: CaseResult[] = [];

    afterAll(() => {
      writeReport(label, results);
    });

    for (const dilCase of DIL_CASES) {
      it.skipIf(!configuredFor(model.provider) || Boolean(dilCase.requiresRepo))(
        `${dilCase.id}: ${dilCase.category}`,
        async ({ run }) => {
          const result = await run(dilCase.prompt);
          const scored = scoreCase(dilCase, result.output.text);
          results.push(scored);
          expect(result.output.systemPrompt).toContain("<dil>");
          const missed = scored.checks.filter((check) => !check.pass).map((check) => check.label);
          const preview = result.output.text.slice(0, 400);
          expect(missed, `${scored.score}% — parse: ${scored.diagnostics}\n--- model output ---\n${preview}`).toEqual(
            [],
          );
          expect(scored.diagnostics).toBe("clean");
        },
      );
    }
  });
}
