/**
 * Live DIL eval through `vitest-evals`.
 *
 * Same cases and scoring as the CLI runner, expressed as a
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
import { createHarness, createJudge, describeEval, type JudgeHarnessInput } from "vitest-evals";
import { apiKeyFor, createDilAgent, type DilAgent } from "./agent.ts";
import { DIL_CASES } from "./cases.ts";
import { DilEvalScorer } from "./render-scoring.ts";
import { type CaseResult, type CheckResult, summarize } from "./scoring.ts";
import { assessSvgLayout, requestSvgJudge } from "./svg-judge.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, "report.json");
const REPORTS = join(HERE, "reports");
const PROVIDER = process.env.DIL_EVAL_PROVIDER ?? "deepseek";
const scorer = new DilEvalScorer(PROVIDER);

afterAll(() => scorer.close());

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

  interface EvalInput {
    readonly caseId: string;
    readonly prompt: string;
    readonly projectRepo?: string;
  }

  type EvalOutput = {
    text: string;
    systemPrompt: string;
    toolCallCount?: number;
    toolNames?: string[];
    assistantTurns?: number;
    trajectoryFile?: string;
  };

  const harness = createHarness<EvalInput, EvalOutput>({
    name: label,
    async run({ input }) {
      const agent = await getAgent();
      const result = await agent.run(input.prompt, { projectRepo: input.projectRepo, caseId: input.caseId });
      return {
        output: {
          text: result.text,
          systemPrompt: result.systemPrompt,
          ...(result.toolCallCount !== undefined ? { toolCallCount: result.toolCallCount } : {}),
          ...(result.toolNames !== undefined ? { toolNames: [...result.toolNames] } : {}),
          ...(result.assistantTurns !== undefined ? { assistantTurns: result.assistantTurns } : {}),
          ...(result.trajectoryFile ? { trajectoryFile: result.trajectoryFile } : {}),
        },
        messages: [
          { role: "user", content: input.prompt },
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
      it.skipIf(!configuredFor(model.provider))(`${dilCase.id}: ${dilCase.category}`, async ({ run }) => {
        const result = await run({ caseId: dilCase.id, prompt: dilCase.prompt, projectRepo: dilCase.projectRepo });
        const scored = await scorer.score(dilCase, result.output.text, result.output, async (screenshots) => {
          let checks: CheckResult[] | undefined;
          const judge = createJudge<EvalInput, EvalOutput>({
            name: "SVG layout",
            judgeHarness: createHarness<JudgeHarnessInput, string>({
              name: `${PROVIDER}/glm-5.3-flash`,
              run: ({ input, signal }) => requestSvgJudge(PROVIDER, screenshots, input, signal),
            }),
            async assess({ input, runJudge }) {
              if (!runJudge) throw new Error("SVG layout judge requires a harness");
              checks = await assessSvgLayout(input.prompt, runJudge);
              return {
                score: checks.filter((check) => check.pass).length / checks.length,
                metadata: { output: checks.map(({ id, pass, detail }) => ({ id, pass, detail: detail ?? "" })) },
              };
            },
          });
          await expect(result).toSatisfyJudge(judge, { threshold: null });
          if (!checks) throw new Error("SVG layout judge returned no checks");
          return checks;
        });
        results.push(scored);
        expect(result.output.systemPrompt).toContain("<dil>");
        const missed = scored.checks
          .filter((check) => check.pass === false)
          .map((check) => (check.detail ? `${check.label}\n${check.detail}` : check.label));
        const preview = result.output.text.slice(0, 400);
        expect(missed, `${scored.score}% — parse: ${scored.diagnostics}\n--- model output ---\n${preview}`).toEqual([]);
      });
    }
  });
}
