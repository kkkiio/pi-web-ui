#!/usr/bin/env node
/**
 * Turn a Playwright JSON report into a compact Markdown summary.
 *
 * Used as a GitHub Actions job summary so a reviewer can read the whole E2E
 * result without opening the Playwright HTML report. Writes to
 * $GITHUB_STEP_SUMMARY when available, otherwise prints to stdout.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(reportDir, "..");
const resultsFile = process.env.PI_E2E_ARTIFACTS
  ? path.join(process.env.PI_E2E_ARTIFACTS, "results.json")
  : path.join(e2eDir, "test-results", "results.json");

if (!existsSync(resultsFile)) {
  console.error(`[summary] missing ${resultsFile}`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(resultsFile, "utf8"));
const rows = [];

function isFileSuite(title) {
  return /\.(spec|feature)\.[cm]?[jt]s$/i.test(title) || title.endsWith(".feature");
}

function walk(suite, trail) {
  const chain = suite.title && !isFileSuite(suite.title) ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    const test = spec.tests[0];
    const result = test?.results?.[test.results.length - 1];
    if (!result) continue;
    const failedStep = (result.steps ?? []).find((step) => step.error);
    rows.push({
      feature: chain[0] ?? "Ungrouped",
      title: spec.title,
      status: result.status === "expected" ? "passed" : result.status,
      duration: result.duration,
      failedStep: failedStep
        ? `${failedStep.title}: ${String(failedStep.error?.message ?? failedStep.error).split("\n")[0]}`
        : null,
    });
  }
  for (const child of suite.suites ?? []) walk(child, chain);
}

for (const suite of report.suites ?? []) walk(suite, []);

const icon = { passed: "✅", failed: "❌", skipped: "⏭️", interrupted: "⚠️" };
const seconds = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const counts = {
  passed: rows.filter((r) => r.status === "passed").length,
  failed: rows.filter((r) => r.status === "failed").length,
};

const lines = [
  counts.failed ? `## ❌ E2E: ${counts.failed} of ${rows.length} scenarios failed` : `## ✅ E2E: ${rows.length} scenarios passed`,
  "",
  "| | Feature | Scenario | Duration |",
  "| --- | --- | --- | --- |",
  ...rows.map((row) => `| ${icon[row.status] ?? ""} | ${row.feature} | ${row.title} | ${seconds(row.duration)} |`),
];

const failures = rows.filter((row) => row.failedStep);
if (failures.length) {
  lines.push("", "### Failures", "");
  for (const row of failures) lines.push(`- **${row.title}** — \`${row.failedStep}\``);
}

const markdown = `${lines.join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`[summary] appended ${rows.length} scenarios to $GITHUB_STEP_SUMMARY`);
} else {
  process.stdout.write(markdown);
}
