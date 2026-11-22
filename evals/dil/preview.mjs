#!/usr/bin/env node
/**
 * Generate preview data from the last eval report (or recordings / examples)
 * and serve the React preview app via Vite.
 *
 *   node evals/dil/preview.mjs                 # the last `npm run eval:dil` report
 *   node evals/dil/preview.mjs --recordings    # the committed recordings
 *   node evals/dil/preview.mjs --examples      # the prompt examples (extensions/examples/*.dil.md)
 *   node evals/dil/preview.mjs --data-only     # write preview-out/data.json and exit
 *   node evals/dil/preview.mjs --no-open       # serve without opening the browser
 */
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { DIL_PROMPT_EXAMPLES, DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";
import { DIL_CASES } from "./cases.ts";
import { scoreCase } from "./scoring.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "preview-out");

function fromRecordings() {
  const cases = DIL_CASES.flatMap((dilCase) => {
    const file = join(HERE, "recordings", `${dilCase.id}.md`);
    if (!existsSync(file)) return [];
    return [scoreCase(dilCase, readFileSync(file, "utf8"))];
  });
  const passed = cases.reduce((sum, item) => sum + item.passed, 0);
  const total = cases.reduce((sum, item) => sum + item.total, 0);

  const manifestFile = join(HERE, "recordings", "manifest.json");
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
  const captured = manifest.capturedAt ? ` · captured ${manifest.capturedAt.slice(0, 10)}` : " · no manifest";
  return {
    model: `${manifest.model ?? "recordings"} (recordings${captured})`,
    summary: { variant: "with-dil", cases, score: total === 0 ? 0 : Math.round((passed / total) * 100) },
  };
}

/**
 * Copy each case's Pi session JSONL into preview-out/trajectories/ and attach a relative
 * `trajectoryUrl` to the case, so the preview can fetch the full agent trajectory
 * on demand without bloating data.json.
 */
function attachTrajectories(reports) {
  const dir = join(OUT, "trajectories");
  for (const report of reports) {
    const slug = String(report.model ?? "model").replaceAll("/", "-").replaceAll(" ", "-");
    const summaries = report.summaries ?? (report.summary ? [report.summary] : []);
    for (const summary of summaries) {
      for (const caseResult of summary.cases ?? []) {
        const caseId = caseResult.id;
        if (!caseId) continue;
        let file =
          caseResult.trajectoryFile && existsSync(caseResult.trajectoryFile) ? caseResult.trajectoryFile : null;
        if (!file) {
          const caseDir = join(HERE, "trajectories", slug, caseId);
          if (!existsSync(caseDir)) continue;
          const files = readdirSync(caseDir).filter((name) => name.endsWith(".jsonl")).sort();
          if (files.length === 0) continue;
          file = join(caseDir, files.at(-1));
        }
        mkdirSync(dir, { recursive: true });
        const name = `${slug}__${caseId}.jsonl`;
        copyFileSync(file, join(dir, name));
        caseResult.trajectoryUrl = `trajectories/${name}`;
      }
    }
  }
}

function fromReports() {
  const dir = join(HERE, "reports");
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
  const reports = files.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
  if (reports.length > 0) {
    return reports.sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));
  }
  const latest = join(HERE, "report.json");
  return existsSync(latest) ? [JSON.parse(readFileSync(latest, "utf8"))] : [];
}

function buildPreviewData(mode) {
  if (mode === "examples") {
    return {
      mode: "examples",
      examples: Object.entries(DIL_PROMPT_EXAMPLES).map(([name, source]) => ({ name, source })),
    };
  }

  const reports = mode === "recordings" ? [fromRecordings()] : fromReports();
  if (reports.length === 0) {
    throw new Error("no eval reports found; run npm run eval:dil first");
  }
  attachTrajectories(reports);

  const definitions = Object.fromEntries(
    DIL_CASES.map((item) => [item.id, { id: item.id, prompt: item.prompt, why: item.why }]),
  );

  return {
    mode,
    systemPrompt: DIL_SYSTEM_PROMPT,
    reports,
    definitions,
  };
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    execFile("open", [url]);
  } else if (process.platform === "linux") {
    execFile("xdg-open", [url], () => {});
  }
}

const mode = process.argv.includes("--examples")
  ? "examples"
  : process.argv.includes("--recordings")
    ? "recordings"
    : process.env.DIL_PREVIEW_SOURCE === "examples" || process.env.DIL_PREVIEW_SOURCE === "recordings"
      ? process.env.DIL_PREVIEW_SOURCE
      : "report";

const data = buildPreviewData(mode);
mkdirSync(OUT, { recursive: true });
const dataFile = join(OUT, "data.json");
writeFileSync(dataFile, JSON.stringify(data));

if (process.argv.includes("--data-only")) {
  console.log(`data: ${dataFile}`);
  process.exit(0);
}

const server = await createServer({
  configFile: join(HERE, "preview", "vite.config.ts"),
  root: join(HERE, "preview"),
  logLevel: "error",
});
await server.listen();

const url = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${server.config.server.port ?? 4446}/`;
console.log(`preview: ${url}`);
if (!process.argv.includes("--no-open")) {
  openBrowser(url);
}

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
