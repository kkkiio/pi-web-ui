#!/usr/bin/env node
/**
 * Record storyboards for an explicit set of features, then build the gallery.
 *
 * Scope is decided by the caller (a human or an agent), not by diffing the repo:
 *
 *   npm run e2e:storyboard -- features/edit-message.feature
 *   npm run e2e:storyboard -- --full
 *
 * A subset run merges with the previous gallery. Merging is refused when step
 * definitions, the harness, or the UI source changed, because old recordings
 * would no longer match the code.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const full = args.includes("--full");
// Accept repo-relative paths (e2e/features/x.feature) and config-relative ones
// (features/x.feature), then hand Playwright the config-relative form.
const features = args
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => (arg.startsWith("e2e/") ? arg.slice("e2e/".length) : arg));

if (!full && features.length === 0) {
  console.error(`[record] pass feature files, or --full:
  npm run e2e:storyboard -- e2e/features/edit-message.feature
  npm run e2e:storyboard -- --full`);
  process.exit(1);
}

for (const feature of features) {
  if (!existsSync(path.join(repoRoot, "e2e", feature))) {
    console.error(`[record] no such feature file: ${feature}`);
    process.exit(1);
  }
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath ?? dir, entry.name);
    newest = Math.max(newest, statSync(file).mtimeMs);
  }
  return newest;
}

const run = (command, commandArgs, env = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
};

// The gallery hashes the current source, so the recording must be produced from the
// current build and the current generated tests.
const distIndex = path.join(repoRoot, "dist", "index.html");
const stale = !existsSync(distIndex) || newestMtime(path.join(repoRoot, "src/web")) > statSync(distIndex).mtimeMs;
if (stale) {
  console.log("[record] dist/ is missing or stale; building the web UI first");
  if (run("npm", ["run", "build:web"]) !== 0) process.exit(1);
}
if (run("npm", ["run", "e2e:gen"]) !== 0) process.exit(1);

const record = (targets) =>
  run("npx", ["playwright", "test", "-c", "e2e/playwright.config.ts", "--project=chromium", ...targets], {
    PI_E2E_STORYBOARD: "1",
  });

const build = (extra) => run("node", ["e2e/report/build-report.mjs", ...extra]);

if (full) {
  if (record([]) !== 0) process.exit(1);
  process.exit(build([]));
}

console.log(`[record] recording ${features.length} feature file(s), merging with the previous gallery`);
if (record(features) !== 0) process.exit(1);

const merged = build(["--merge"]);
if (merged === 0) process.exit(0);

// The builder refuses to merge onto a stale base; a full run is the only safe answer.
console.log("[record] merge refused (steps, harness or UI changed); recording everything");
if (record([]) !== 0) process.exit(1);
process.exit(build([]));
