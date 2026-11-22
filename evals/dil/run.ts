/**
 * DIL eval runner — "can this model actually emit DIL?"
 *
 *   npm run eval:dil                       # score live model outputs
 *   npm run eval:dil -- --dry              # replay available recordings without a model
 *   npm run eval:dil -- --model deepseek-v4-pro --runs 3
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { createDilAgent, type DilAgent } from "./agent.ts";
import { DIL_CASES } from "./cases.ts";
import { DilEvalScorer } from "./render-scoring.ts";
import { type CaseResult, summarize, type VariantSummary } from "./scoring.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDINGS = join(HERE, "recordings");
const REPORT = join(HERE, "report.json");
/** One file per model, so a matrix does not overwrite itself. */
const REPORTS = join(HERE, "reports");

interface Options {
  readonly provider: string;
  readonly model: string;
  readonly runs: number;
  readonly dry: boolean;
  readonly record: boolean;
  readonly caseIds: readonly string[];
}

function parseOptions(argv: readonly string[]): Options {
  const env = loadEnv("", join(HERE, "../.."), "DIL_EVAL_");
  const option = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const model = option("model") ?? process.env.DIL_EVAL_MODEL ?? "deepseek-flash";
  const runs = Number(option("runs") ?? process.env.DIL_EVAL_RUNS ?? "1");
  return {
    provider: option("provider") ?? env.DIL_EVAL_PROVIDER ?? "deepseek",
    model,
    runs: Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 1,
    dry: argv.includes("--dry"),
    record: argv.includes("--record"),
    caseIds: argv.filter(
      (argument, index) => !argument.startsWith("--") && !["--model", "--provider", "--runs"].includes(argv[index - 1]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function recordingPath(caseId: string, run: number): string {
  const suffix = run === 1 ? "" : `.${run}`;
  return join(RECORDINGS, `${caseId}${suffix}.md`);
}

async function runCases(options: Options, generator: DilAgent | null, scorer: DilEvalScorer): Promise<VariantSummary> {
  const cases: CaseResult[] = [];
  for (const dilCase of DIL_CASES) {
    if (options.caseIds.length && !options.caseIds.includes(dilCase.id)) continue;

    if (options.dry) {
      const file = recordingPath(dilCase.id, 1);
      if (!existsSync(file)) {
        if (options.caseIds.includes(dilCase.id)) throw new Error(`missing recording ${file}; run with --record first`);
        process.stderr.write(`  no recording for ${dilCase.id}\n`);
        continue;
      }
      cases.push(await scorer.score(dilCase, readFileSync(file, "utf8"), undefined, null));
      continue;
    }

    for (let run = 1; run <= options.runs; run++) {
      const answered = await (generator as DilAgent).run(dilCase.prompt, {
        projectRepo: dilCase.projectRepo,
        caseId: dilCase.id,
      });
      const text = answered.text;
      const section = answered.systemPrompt.includes("<dil>") ? "dil" : "no-dil";
      const result = await scorer.score(dilCase, text, answered);
      cases.push(result);
      if (options.record) writeFile(recordingPath(dilCase.id, run), `${text}\n`);
      const toolsInfo = answered.toolCallCount !== undefined ? `  tools:${answered.toolCallCount}` : "";
      process.stdout.write(
        `  ${dilCase.id.padEnd(12)} run ${run}  ${String(result.score).padStart(3)}%  (${result.passed}/${result.total})  prompt:${section}${toolsInfo}  ${result.diagnostics}\n`,
      );
    }
  }
  return summarize("with-dil", cases);
}

function writeFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function report(summary: VariantSummary, options: Options, generator: DilAgent | null): void {
  const lines: string[] = [];
  lines.push(`# DIL eval — ${generator?.label ?? "recordings"}${options.dry ? " (dry)" : ""}`, "");

  lines.push(`model: ${generator?.label ?? "recordings"}${options.dry ? " (dry)" : ""}`, "");
  lines.push(`## ${summary.variant}`, "");
  lines.push(
    "| case | category | score | scoring coverage | DIL nodes | diagnostics |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  );
  for (const result of summary.cases) {
    lines.push(
      `| ${result.id} | ${result.category} | ${result.score}% | ${result.total}/${result.total + result.unscored} | ${result.dilNodes} | ${result.diagnostics} |`,
    );
  }
  lines.push("");
  for (const result of summary.cases) {
    const failed = result.checks.filter((check) => check.pass === false);
    const unscored = result.checks.filter((check) => check.pass === null);
    lines.push(
      `- **${result.id}** ${result.passed}/${result.total}${failed.length ? ` — missed: ${failed.map((check) => check.label).join("; ")}` : ""}`,
    );
    for (const check of [...failed, ...unscored]) {
      lines.push(
        `  - ${check.id}${check.pass === null ? " (unscored)" : ""}${check.detail ? ` — ${check.detail}` : ""}`,
      );
    }
  }
  lines.push("");

  const text = lines.join("\n");
  process.stdout.write(`\n${text}\n`);
  if (options.dry) {
    process.stdout.write("\nreport: (dry run — report.json left untouched)\n");
    return;
  }
  const body = `${JSON.stringify({ model: generator?.label ?? "unknown", capturedAt: new Date().toISOString(), summary }, null, 2)}\n`;
  // `<reports>/<provider>-<model>.json` keeps a matrix; `report.json` stays the latest run.
  const slug = (generator?.label ?? "unknown").replaceAll("/", "-").replaceAll(" ", "-");
  writeFile(join(REPORTS, `${slug}.json`), body);
  writeFile(REPORT, body);
  process.stdout.write(`\nreport: ${join(REPORTS, `${slug}.json`)} (latest: ${REPORT})\n`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const generator = options.dry ? null : await createDilAgent(options);
  if (generator) process.stdout.write(`model: ${generator.label}\n`);

  const scorer = new DilEvalScorer(options.provider);
  const summary = await runCases(options, generator, scorer).finally(() => scorer.close());
  if (options.record && generator) {
    writeFile(
      join(RECORDINGS, "manifest.json"),
      `${JSON.stringify({ model: generator.label, harness: "pi-agent", capturedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  }
  report(summary, options, generator);
}

await main();
