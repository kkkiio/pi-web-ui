/**
 * DIL eval runner — "can this model actually emit DIL?"
 *
 *   npm run eval:dil                       # live, DeepSeek, DIL system prompt
 *   npm run eval:dil -- --variant both     # also run without the prompt (lift)
 *   npm run eval:dil -- --dry --record     # score recordings, write new ones
 *   npm run eval:dil -- --model deepseek-v4-pro --runs 3
 *
 * Design notes (why not `@earendil-works/pi-evals`):
 *
 *   - that package is `private: true` in the pi workspace, so it cannot be a dependency
 *     here; its harness also boots a full coding-agent session in Docker, which measures
 *     Pi, not DIL;
 *   - what transfers is the shape: a case list, a harness, deterministic checks, and an
 *     optional judge. Generation goes through `@earendil-works/pi-ai`, the same model
 *     runtime Pi itself uses, so `~/.pi/agent/auth.json`, `DEEPSEEK_API_KEY` and a local
 *     `.env` all work;
 *   - scoring is our own `parseDocument`, so a case passes only if the DIL really parses.
 *
 * Nothing runs in CI here: live calls need a key, and the offline half (`--dry`) is
 * covered by `scoring.test.ts`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDilAgent, type DilAgent } from "./agent.ts";
import { DIL_CASES, DIL_SYSTEM_PROMPT } from "./cases.ts";
import { type CaseResult, scoreCase, summarize, type VariantSummary } from "./scoring.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDINGS = join(HERE, "recordings");
const REPORT = join(HERE, "report.json");

interface Options {
  readonly variant: "with" | "without" | "both";
  readonly provider: string;
  readonly model: string;
  readonly runs: number;
  readonly dry: boolean;
  readonly record: boolean;
  readonly caseIds: readonly string[];
}

function parseOptions(argv: readonly string[]): Options {
  const option = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const model = option("model") ?? process.env.DIL_EVAL_MODEL ?? "deepseek-flash";
  const runs = Number(option("runs") ?? process.env.DIL_EVAL_RUNS ?? "1");
  return {
    variant: (option("variant") ?? process.env.DIL_EVAL_VARIANT ?? "with") as Options["variant"],
    provider: option("provider") ?? process.env.DIL_EVAL_PROVIDER ?? "deepseek",
    model,
    runs: Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 1,
    dry: argv.includes("--dry"),
    record: argv.includes("--record"),
    caseIds: argv.filter((argument, index) => !argument.startsWith("--") && !argv[index - 1]?.startsWith("--")),
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function variantsFor(options: Options): readonly ("with" | "without")[] {
  return options.variant === "both" ? ["with", "without"] : [options.variant];
}

function recordingPath(caseId: string, variant: string, run: number): string {
  const suffix = run === 1 ? "" : `.${run}`;
  return join(RECORDINGS, `${caseId}.${variant}${suffix}.md`);
}

async function runVariant(
  variant: "with" | "without",
  options: Options,
  generator: DilAgent | null,
): Promise<VariantSummary> {
  const cases: CaseResult[] = [];
  for (const dilCase of DIL_CASES) {
    if (options.caseIds.length && !options.caseIds.includes(dilCase.id)) continue;

    if (options.dry) {
      cases.push(scoreCase(dilCase, readRecording(dilCase.id, variant)));
      continue;
    }

    for (let run = 1; run <= options.runs; run++) {
      const answered = await (generator as DilAgent).run(dilCase.prompt, variant === "with" ? DIL_SYSTEM_PROMPT : null);
      const text = answered.text;
      const section = answered.systemPrompt.includes("<dil>") ? "dil" : "no-dil";
      const result = scoreCase(dilCase, text);
      cases.push(result);
      if (options.record) writeFile(recordingPath(dilCase.id, variant, run), `${text}\n`);
      process.stdout.write(
        `  ${dilCase.id.padEnd(12)} run ${run}  ${String(result.score).padStart(3)}%  (${result.passed}/${result.total})  prompt:${section}  ${result.diagnostics}\n`,
      );
    }
  }
  return summarize(variant, cases);
}

function readRecording(caseId: string, variant: string): string {
  const path = recordingPath(caseId, variant, 1);
  if (!existsSync(path)) throw new Error(`missing recording ${path}; run with --record first`);
  return readFileSync(path, "utf8");
}

function writeFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function report(summaries: readonly VariantSummary[], options: Options, generator: DilAgent | null): void {
  const lines: string[] = [];
  lines.push(`# DIL eval — ${generator?.label ?? "recordings"}${options.dry ? " (dry)" : ""}`, "");

  lines.push("| variant | score | checks |", "| --- | ---: | ---: |");
  for (const summary of summaries) {
    lines.push(`| ${summary.variant} | ${summary.score}% | ${summary.passed}/${summary.total} |`);
  }
  lines.push("");

  for (const summary of summaries) {
    lines.push(`## ${summary.variant}`, "");
    lines.push("| case | category | score | DIL nodes | diagnostics |", "| --- | --- | ---: | ---: | --- |");
    for (const result of summary.cases) {
      lines.push(
        `| ${result.id} | ${result.category} | ${result.score}% | ${result.dilNodes} | ${result.diagnostics} |`,
      );
    }
    lines.push("");
    for (const result of summary.cases) {
      const failed = result.checks.filter((check) => !check.pass);
      lines.push(
        `- **${result.id}** ${result.passed}/${result.total}${failed.length ? ` — missed: ${failed.map((check) => check.label).join("; ")}` : ""}`,
      );
    }
    lines.push("");
  }

  const text = lines.join("\n");
  process.stdout.write(`\n${text}\n`);
  writeFile(REPORT, `${JSON.stringify({ model: generator?.label ?? "recordings", summaries }, null, 2)}\n`);
  process.stdout.write(`\nreport: ${REPORT}\n`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const generator = options.dry ? null : await createDilAgent(options);
  if (generator) process.stdout.write(`model: ${generator.label}\n`);

  const summaries: VariantSummary[] = [];
  for (const variant of variantsFor(options)) {
    process.stdout.write(`\nvariant: ${variant}\n`);
    summaries.push(await runVariant(variant, options, generator));
  }
  report(summaries, options, generator);
}

await main();
