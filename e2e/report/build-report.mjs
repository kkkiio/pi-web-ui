#!/usr/bin/env node
/**
 * Build a static, human-readable E2E gallery from a Playwright JSON report.
 *
 * Input:  e2e/test-results/results.json + its video/trace/step screenshots
 * Output: e2e/report-out/  (index.html + scenarios/<id>.html + assets/)
 *
 * The gallery is intentionally dependency-free: it opens from the filesystem and
 * is served as-is from GitHub Pages. It favors "read one scenario in 10 seconds"
 * over reproducing the Playwright HTML report.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(reportDir, "..");
const repoRoot = path.resolve(e2eDir, "..");

const artifactsDir = process.env.PI_E2E_ARTIFACTS
  ? path.resolve(process.env.PI_E2E_ARTIFACTS)
  : path.join(e2eDir, "test-results");
const resultsFile = path.join(artifactsDir, "results.json");
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

// Positional argument before the first --flag is the output directory.
const argv = process.argv.slice(2);
const firstFlag = argv.findIndex((value) => value.startsWith("--"));
const positional = (firstFlag === -1 ? argv : argv.slice(0, firstFlag))[0];
const outDir = positional ? path.resolve(positional) : path.join(e2eDir, "report-out");
const merge = Boolean(option("merge", false));
const baseDir = path.resolve(String(option("base", outDir)));
const stagingDir = `${outDir}.next`;

if (!existsSync(resultsFile)) {
  console.error(`[gallery] missing ${path.relative(repoRoot, resultsFile)}; run the E2E suite first.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(resultsFile, "utf8"));

// ---------------------------------------------------------------- feature text

const STEP_PREFIXES = [
  "Given ",
  "When ",
  "Then ",
  "And ",
  "But ",
  "* ",
  "假如",
  "当",
  "那么",
  "而且",
  "并且",
  "但是",
  "如果",
];
const SCENARIO_RE = /^(Scenario Outline|Scenario Template|Scenario|场景大纲|场景|劇本大綱|劇本)\s*[:：]\s*(.+)$/;

/** Read scenario descriptions (`Intent:` blocks) straight from the feature files. */
function loadFeatureDocs() {
  const dir = path.join(e2eDir, "features");
  const docs = new Map();
  if (!existsSync(dir)) return docs;

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".feature"))) {
    const scenarios = new Map();
    let pendingTags = [];
    let current = null;
    let inSteps = false;

    for (const raw of readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#")) continue;
      if (line.startsWith("@")) {
        if (!current) pendingTags = line.split(/\s+/).filter(Boolean);
        continue;
      }
      const scenario = line.match(SCENARIO_RE);
      if (scenario) {
        current = { title: scenario[2].trim(), tags: pendingTags, intent: [], fields: [] };
        scenarios.set(current.title, current);
        pendingTags = [];
        inSteps = false;
        continue;
      }
      if (!current) continue;
      if (STEP_PREFIXES.some((prefix) => line.startsWith(prefix)) || /^(Examples|例)/.test(line)) {
        inSteps = true;
        continue;
      }
      if (inSteps) continue;
      const labeled = line.match(/^([A-Za-z][A-Za-z ]{2,24}):\s*(.+)$/);
      if (labeled) {
        current.fields.push({ label: labeled[1].trim(), text: labeled[2].trim() });
      } else if (current.fields.length > 0) {
        current.fields[current.fields.length - 1].text += ` ${line}`;
      } else {
        current.intent.push(line);
      }
    }
    docs.set(`features/${file}`, scenarios);
  }
  return docs;
}

const featureDocs = loadFeatureDocs();

function listFiles(dir, test) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, test));
    else if (test(entry.name)) files.push(full);
  }
  return files;
}

function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(repoRoot, file));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}

const stepHash = hashFiles([
  ...listFiles(path.join(e2eDir, "steps"), (name) => /\.[cm]?[jt]s$/.test(name)),
  ...listFiles(path.join(e2eDir, "harness"), (name) => /\.[cm]?[jt]s$/.test(name)),
  path.join(e2eDir, "playwright.config.ts"),
]);
const uiHash = hashFiles([
  ...listFiles(path.join(repoRoot, "src/web"), (name) => /\.[cm]?[jt]sx?$/.test(name) || name.endsWith(".css")),
  ...listFiles(path.join(repoRoot, "extensions"), (name) => /\.[cm]?[jt]s$/.test(name)),
]);
const featureHashes = new Map(
  [...featureDocs.keys()].map((featurePath) => [featurePath, hashFiles([path.join(e2eDir, featurePath)])]),
);

// ---------------------------------------------------------------- model

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "scenario";

const usedIds = new Set();
function uniqueId(base) {
  let id = base;
  let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
}

const scenarios = [];
let order = 0;

function isFileSuite(title) {
  return /\.(spec|feature)\.[cm]?[jt]s$/i.test(title) || title.endsWith(".feature");
}

function walk(suite, trail) {
  const chain = suite.title && !isFileSuite(suite.title) ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    const test = spec.tests[0];
    const result = test?.results?.[test.results.length - 1];
    if (!result) continue;
    const feature = chain[0] ?? "Ungrouped";
    const scenarioTitle = chain.length > 1 ? chain.slice(1).join(" › ") : spec.title;
    const attachments = result.attachments ?? [];
    const shots = attachments
      .filter((a) => /^step-\d+$/.test(a.name) && a.path)
      .sort((a, b) => a.name.localeCompare(b.name));
    const featureFile = String(spec.file ?? "").replace(/\.spec\.[cm]?[jt]s$/, "");
    scenarios.push({
      order: order++,
      featureFile,
      outline: chain.length > 1 ? chain.slice(1).join(" › ") : null,
      id: uniqueId(`${slug(feature)}--${slug(chain.length > 1 ? [...chain.slice(1), spec.title].join("-") : spec.title)}`),
      feature,
      // Outline examples live under a describe, so keep the parent name visible.
      title: chain.length > 1 ? `${chain.slice(1).join(" › ")} › ${spec.title}` : spec.title,
      scenarioTitle,
      // Playwright JSON strips the leading "@" from tags.
      tags: (spec.tags ?? []).map((tag) => (tag.startsWith("@") ? tag : `@${tag}`)),
      ...(() => {
        const doc = featureDocs.get(String(spec.file ?? "").replace(/\.spec\.[cm]?[jt]s$/, ""))?.get(spec.title);
        return {
          intent: doc?.intent.join(" ") || null,
          fields: doc?.fields ?? [],
        };
      })(),
      status: result.status === "expected" ? "passed" : result.status,
      duration: result.duration,
      startTime: result.startTime,
      error: result.error ? String(result.error.message ?? result.error).trim() : null,
      steps: (result.steps ?? []).map((step) => ({
        title: step.title,
        duration: step.duration ?? 0,
        error: step.error ? String(step.error.message ?? step.error).trim() : null,
      })),
      shots: shots.map((s) => path.resolve(artifactsDir, s.path)),
      video: attachments.find((a) => a.name === "video" && a.path)?.path,
      trace: attachments.find((a) => a.name === "trace" && a.path)?.path,
      timingsFile: attachments.find((a) => a.name === "storyboard-timings" && a.path)?.path,
    });
  }
  for (const child of suite.suites ?? []) walk(child, chain);
}

for (const suite of report.suites ?? []) walk(suite, []);

// The gallery documents what a user sees. Scenarios tagged @no-ui never open a
// browser, and a scenario without a recording has nothing to show.
for (let index = scenarios.length - 1; index >= 0; index -= 1) {
  const scenario = scenarios[index];
  if (scenario.tags.includes("@no-ui") || !scenario.video) scenarios.splice(index, 1);
}

// ---------------------------------------------------------------- run metadata

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || "";
const run = {
  generatedAt: new Date().toISOString(),
  commit: (process.env.GITHUB_SHA || git("rev-parse", "HEAD")).slice(0, 7),
  dirty: process.env.GITHUB_SHA ? false : git("status", "--porcelain").length > 0,
  branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git("rev-parse", "--abbrev-ref", "HEAD"),
  pr: prNumber,
  storyboard: process.env.PI_E2E_STORYBOARD === "1",
  totalDuration: scenarios.reduce((sum, s) => sum + s.duration, 0),
  counts: {
    passed: scenarios.filter((s) => s.status === "passed").length,
    failed: scenarios.filter((s) => s.status === "failed").length,
    skipped: scenarios.filter((s) => s.status === "skipped").length,
    total: scenarios.length,
  },
};

// ---------------------------------------------------------------- assets

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(path.join(stagingDir, "scenarios"), { recursive: true });

for (const scenario of scenarios) {
  const dir = path.join(stagingDir, "assets", scenario.id);
  mkdirSync(dir, { recursive: true });
  if (scenario.video) cpSync(scenario.video, path.join(dir, "video.webm"));
  if (scenario.trace) cpSync(scenario.trace, path.join(dir, "trace.zip"));
  scenario.stepImages = scenario.shots.map((shot, index) => {
    const name = `step-${String(index + 1).padStart(2, "0")}.png`;
    cpSync(shot, path.join(dir, name));
    return `assets/${scenario.id}/${name}`;
  });
  scenario.videoPath = scenario.video ? `assets/${scenario.id}/video.webm` : null;
  scenario.tracePath = scenario.trace ? `assets/${scenario.id}/trace.zip` : null;
  scenario.timings = null;
  if (scenario.timingsFile) {
    try {
      const raw = JSON.parse(readFileSync(path.resolve(artifactsDir, scenario.timingsFile), "utf8"));
      // Only keep timings that can line up with the reported step list.
      scenario.timings = { endedAt: raw.endedAt, steps: raw.steps.slice(0, scenario.steps.length) };
    } catch {
      scenario.timings = null;
    }
  }
  // The recording starts at page load, so the first ~0.8s is a blank shell.
  // Preview from the end of the "open the page" step instead of from 0.
  scenario.contentFromEndMs =
    scenario.timings && scenario.timings.steps.length > 1
      ? Math.max(0, scenario.timings.endedAt - scenario.timings.steps[1].endedAt)
      : 0;
}

// ---------------------------------------------------------------- merge with a previous build

let carried = 0;
let dropped = 0;
if (merge) {
  const manifestFile = path.join(baseDir, "manifest.json");
  if (!existsSync(manifestFile)) {
    console.warn("[gallery] no previous manifest; building a full gallery");
  } else {
    const previous = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (previous.stepHash !== stepHash) {
      console.error("[gallery] step definitions or harness changed since the last build; run a full storyboard.");
      process.exit(1);
    }
    if (previous.uiHash !== uiHash) {
      console.error("[gallery] UI source changed since the last build; run a full storyboard.");
      process.exit(1);
    }
    const recorded = new Set(scenarios.map((scenario) => scenario.id));
    for (const old of previous.scenarios ?? []) {
      if (recorded.has(old.id)) continue;
      const featureDoc = featureDocs.get(old.featureFile);
      const stillThere = old.outline ? featureDoc?.has(old.outline) : featureDoc?.has(old.title);
      const featureUnchanged = previous.featureHashes?.[old.featureFile] === featureHashes.get(old.featureFile);
      const assetsThere = existsSync(path.join(baseDir, "assets", old.id));
      if (!featureDoc || !stillThere || !featureUnchanged || !assetsThere) {
        dropped += 1;
        continue;
      }
      cpSync(path.join(baseDir, "assets", old.id), path.join(stagingDir, "assets", old.id), { recursive: true });
      scenarios.push(old);
      carried += 1;
    }
    console.log(`[gallery] merged ${carried} unchanged scenarios, dropped ${dropped}`);
  }
}

// Keep the feature grouping stable regardless of what was recorded this run.
scenarios.sort((left, right) =>
  left.featureFile === right.featureFile
    ? (left.order ?? 0) - (right.order ?? 0)
    : String(left.featureFile).localeCompare(String(right.featureFile)),
);

// ---------------------------------------------------------------- helpers

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

const keywords = ["Given", "When", "Then", "And", "But"];
function splitKeyword(title) {
  const keyword = keywords.find((word) => title.startsWith(`${word} `));
  return keyword ? { keyword, text: title.slice(keyword.length + 1) } : { keyword: "", text: title };
}

function tagChip(tag) {
  const kind = tag.replace(/^@/, "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `<span class="tag tag-${kind}">${escapeHtml(tag)}</span>`;
}

const CSS = `
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #e4e7ec;
  --text: #14161a;
  --muted: #667085;
  --accent: #4338ca;
  --pass: #12805c;
  --pass-bg: #e7f6ef;
  --fail: #c0272d;
  --fail-bg: #fdecec;
  --skip: #667085;
  --skip-bg: #eef0f3;
  --radius: 14px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, .kw, .dur { font-family: var(--mono); }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px 72px; }
.topbar {
  position: sticky; top: 0; z-index: 10;
  backdrop-filter: blur(8px);
  background: rgba(246, 247, 249, 0.86);
  border-bottom: 1px solid var(--border);
}
.topbar-inner {
  max-width: 1180px; margin: 0 auto; padding: 12px 24px;
  display: flex; align-items: center; gap: 16px;
}
.brand { font-weight: 650; letter-spacing: -0.01em; }
.brand a { color: inherit; }
.crumbs { color: var(--muted); font-size: 13px; }
.crumbs a { color: var(--muted); }
.spacer { flex: 1; }
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
}
.pill.passed { color: var(--pass); background: var(--pass-bg); }
.pill.failed { color: var(--fail); background: var(--fail-bg); }
.pill.skipped, .pill.interrupted { color: var(--skip); background: var(--skip-bg); }
.tag {
  font-size: 12px; color: var(--muted); background: var(--surface);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px;
}
.tag-p0 { color: #b42318; background: #fef3f2; border-color: #fecdca; font-weight: 600; }
.tag-p1 { color: #175cd3; background: #eff8ff; border-color: #b2ddff; }
.tag-mobile { color: #6941c6; background: #f4f3ff; border-color: #d9d6fe; }
.tag-no-ui { color: #475467; background: #f2f4f7; border-color: #e4e7ec; }
.tag-docs { color: #027a48; background: #ecfdf3; border-color: #abefc6; }
.dirty { color: #b54708; background: #fffaeb; border: 1px solid #fedf89; border-radius: 999px; padding: 0 7px; font-size: 11px; }
h1 { font-size: 26px; line-height: 1.25; letter-spacing: -0.02em; margin: 6px 0 10px; }
h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 14px; }
.eyebrow { color: var(--muted); font-size: 13px; margin: 0; }
.hero { padding: 40px 0 8px; }
.hero p.lede { color: var(--muted); max-width: 70ch; margin: 0; }
.runmeta { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 18px 0 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted); }
.runmeta strong { color: var(--text); font-weight: 600; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; margin: 26px 0 30px; }
.toolbar .runmeta { margin: 0; }
.chip {
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 550; cursor: pointer;
}
.chip[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.search {
  flex: 1 1 240px; min-width: 200px; max-width: 360px;
  border: 1px solid var(--border); background: var(--surface); border-radius: 999px;
  padding: 7px 14px; font: inherit; font-size: 14px; color: var(--text);
}
.feature-block { margin: 0 0 40px; }
.feature-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.feature-head h2 { margin: 0; text-transform: none; letter-spacing: -0.01em; font-size: 17px; color: var(--text); }
.feature-head .count { color: var(--muted); font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card {
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  color: inherit; transition: border-color 120ms ease, transform 120ms ease;
}
.card:hover { text-decoration: none; border-color: #c7ccd6; transform: translateY(-1px); }
.card[hidden], .feature-block[hidden] { display: none; }
.thumb { position: relative; aspect-ratio: 16 / 10; background: #eef0f4; overflow: hidden; }
.thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .pill { position: absolute; top: 10px; left: 10px; background: rgba(255,255,255,0.94); }
.thumb .no-video {
  position: absolute; inset: 0; display: grid; place-items: center;
  color: var(--muted); font-size: 13px;
}
.card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.card h3 { margin: 0; font-size: 15.5px; line-height: 1.35; letter-spacing: -0.01em; }
.card .steps-preview {
  margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.meta-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 12.5px; color: var(--muted); }
.layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 32px; align-items: start; padding-top: 26px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.video-panel { overflow: hidden; }
.video-panel video { width: 100%; max-height: 72vh; object-fit: contain; display: block; background: #0b0d10; }
.video-meta { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 13px; color: var(--muted); }
.now {
  padding: 10px 16px; font-size: 13px; color: var(--text);
  background: #f9fafb; border-top: 1px solid var(--border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chapters { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--border); }
.chapter {
  display: inline-flex; gap: 8px; align-items: baseline; text-align: left;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; color: var(--muted); cursor: pointer;
  max-width: 100%;
}
.chapter:hover { background: #f7f8fa; color: var(--text); }
.chapter[aria-current] { background: #eef2ff; color: var(--accent); }
.chapter-no { font: 600 11px/1.4 var(--mono); opacity: 0.7; }
.chapter-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seek {
  margin-left: 8px; border: 1px solid var(--border); background: var(--surface);
  border-radius: 6px; padding: 0 6px; font-size: 10px; line-height: 18px; color: var(--muted); cursor: pointer;
}
.seek:hover { color: var(--accent); border-color: var(--accent); }
.step.current { background: #f4f6ff; border-radius: 10px; box-shadow: 0 0 0 6px #f4f6ff; }
.brief {
  display: grid; gap: 8px; margin: 16px 0 0; padding: 14px 16px; max-width: 92ch;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
}
.brief > div { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 12px; }
.brief dt {
  font: 700 11px/1.7 var(--mono); letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent);
}
.brief dd { margin: 0; font-size: 14px; line-height: 1.5; }
.intent {
  max-width: 82ch; margin: 16px 0 0; padding: 12px 16px; font-size: 14px;
  background: var(--surface); border: 1px solid var(--border);
  border-left: 3px solid var(--accent); border-radius: 10px;
}
.intent-label {
  display: inline-block; margin-right: 10px; vertical-align: 1px;
  font: 700 11px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent);
}
.video-meta code { font-size: 12px; }
.steps-panel { padding: 20px 22px 24px; margin-top: 20px; }
.steps-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
.step { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 24px; align-items: start; }
.step-copy { display: flex; flex-direction: column; gap: 8px; }
.step .shot { max-width: none; }
@media (max-width: 820px) {
  .step { grid-template-columns: minmax(0, 1fr); }
}
.step { list-style: none; padding: 0 0 18px 26px; position: relative; }
.step:not(:last-child)::before { content: ""; position: absolute; left: 7px; top: 18px; bottom: 0; width: 1px; background: var(--border); }
.step::after {
  content: ""; position: absolute; left: 2px; top: 5px; width: 9px; height: 9px;
  border-radius: 50%; background: var(--surface); border: 2px solid #b9c0cc;
}
.step.failed::after { border-color: var(--fail); background: var(--fail); }
.step-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.kw { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
.kw.context { color: #7a5af8; }
.kw.outcome { color: var(--pass); }
.dur { margin-left: auto; font-size: 11.5px; color: var(--muted); }
.step-text { margin: 0 0 10px; font-size: 14.5px; }
.step .shot { display: block; width: 100%; max-width: 560px; border-radius: 8px; overflow: hidden; }
.step .shot img { width: 100%; border: 1px solid var(--border); border-radius: 8px; display: block; }
.step .shot:hover img { border-color: #aab2c0; }
.step-no { font: 600 11px/1.4 var(--mono); color: var(--muted); }
.step .error { margin: 8px 0 0; padding: 10px 12px; background: var(--fail-bg); border-radius: 8px; color: #7a1d20; font: 12px/1.5 var(--mono); white-space: pre-wrap; }
.failure { margin: 26px 0 0; padding: 16px 18px; background: var(--fail-bg); border: 1px solid #f5c2c2; border-radius: var(--radius); }
.failure h2 { color: var(--fail); margin-bottom: 8px; }
.failure pre { margin: 0; white-space: pre-wrap; font: 12.5px/1.55 var(--mono); color: #7a1d20; }
.empty { padding: 40px; text-align: center; color: var(--muted); }
footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12.5px; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .video-panel { position: static; }
  .wrap { padding: 0 16px 56px; }
  .topbar-inner { padding: 10px 16px; }
}
`;

// ---------------------------------------------------------------- pages

function shell({ title, body, crumbs = "", root = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <span class="brand"><a href="${root}index.html">Pi Web UI · E2E storyboard</a></span>
    <span class="crumbs">${crumbs}</span>
    <span class="spacer"></span>
  </div>
</header>
${body}
</body>
</html>`;
}

function runMeta() {
  const items = [
    run.branch ? `<li>branch <strong>${escapeHtml(run.branch)}</strong></li>` : "",
    run.commit
      ? `<li>commit <code>${escapeHtml(run.commit)}</code>${run.dirty ? ' <span class="dirty">uncommitted changes</span>' : ""}</li>`
      : "",
    run.pr ? `<li>PR <strong>#${escapeHtml(run.pr)}</strong></li>` : "",
    `<li>recorded <strong>${escapeHtml(run.generatedAt.slice(0, 16).replace("T", " "))}</strong> UTC</li>`,
  ];
  return `<ul class="runmeta">${items.filter(Boolean).join("")}</ul>`;
}

// Index page
const features = new Map();
for (const scenario of scenarios) {
  if (!features.has(scenario.feature)) features.set(scenario.feature, []);
  features.get(scenario.feature).push(scenario);
}

const featureBlocks = [...features.entries()]
  .map(([feature, list]) => {
    const cards = list
      .map((scenario) => {
        const search = `${scenario.feature} ${scenario.title} ${scenario.tags.join(" ")}`.toLowerCase();
        const preview = scenario.steps
          .slice(0, 4)
          .map((s) => escapeHtml(s.title))
          .join(" → ");
        const thumb = scenario.videoPath
          ? `<video muted loop playsinline preload="metadata" poster="${escapeHtml(scenario.stepImages.at(-1) ?? "")}" src="${escapeHtml(scenario.videoPath)}" data-preview data-from-end="${scenario.contentFromEndMs}"></video>`
          : `<span class="no-video">No recording</span>`;
        return `      <a class="card" href="scenarios/${scenario.id}.html" data-search="${escapeHtml(search)}">
        <div class="thumb">${thumb}</div>
        <div class="card-body">
          <h3>${escapeHtml(scenario.title)}</h3>
          <div class="meta-row">
            <span>${scenario.steps.length} steps</span>
            ${scenario.tags.map(tagChip).join("")}
          </div>
          <p class="steps-preview">${scenario.fields.length > 0 ? escapeHtml(scenario.fields[0].text) : preview}</p>
        </div>
      </a>`;
      })
      .join("\n");
    return `  <section class="feature-block" id="${slug(feature)}" data-feature>
    <div class="feature-head">
      <h2>${escapeHtml(feature)}</h2>
      <span class="count">${list.length} scenario${list.length === 1 ? "" : "s"}</span>
    </div>
    <div class="cards">
${cards}
    </div>
  </section>`;
  })
  .join("\n");

const indexBody = `<main class="wrap">
  <div class="toolbar">
    <input class="search" type="search" placeholder="Search scenarios, steps, tags" data-search-input />
    ${runMeta()}
  </div>

${featureBlocks}
  <p class="empty" data-empty hidden>No scenario matches this filter.</p>

  <footer>Storyboard artifacts: video (webm), one screenshot per Gherkin step, and a Playwright trace for deep inspection. Regenerate with <code>npm run e2e:storyboard</code>.</footer>
</main>
<script>
const cards = [...document.querySelectorAll(".card")];
const blocks = [...document.querySelectorAll("[data-feature]")];
const search = document.querySelector("[data-search-input]");
const empty = document.querySelector("[data-empty]");

function apply() {
  const query = (search.value || "").trim().toLowerCase();
  let visible = 0;
  for (const card of cards) {
    const show = !query || card.dataset.search.includes(query);
    card.hidden = !show;
    if (show) visible += 1;
  }
  for (const block of blocks) {
    block.hidden = !block.querySelector(".card:not([hidden])");
  }
  empty.hidden = visible !== 0;
}

search.addEventListener("input", apply);

function startAtContent(video) {
  const fromEnd = Number(video.dataset.fromEnd || 0);
  if (!fromEnd) return;
  const seek = () => {
    video.currentTime = Math.max(0, video.duration - fromEnd / 1000);
  };
  if (video.readyState >= 1) seek();
  else video.addEventListener("loadedmetadata", seek, { once: true });
}

for (const video of document.querySelectorAll("video[data-preview]")) {
  const card = video.closest(".card");
  card.addEventListener("mouseenter", () => {
    startAtContent(video);
    video.play().catch(() => {});
  });
  card.addEventListener("mouseleave", () => {
    video.pause();
    startAtContent(video);
  });
}
</script>`;

writeFileSync(path.join(stagingDir, "index.html"), shell({ title: "Pi Web UI · E2E storyboard", body: indexBody }));

// Detail pages
for (const scenario of scenarios) {
  const steps = scenario.steps
    .map((step, index) => {
      const { keyword, text } = splitKeyword(step.title);
      const kind = keyword === "Then" ? "outcome" : keyword === "Given" ? "context" : "";
      const image = scenario.stepImages[index]
        ? `<a class="shot" href="../${escapeHtml(scenario.stepImages[index])}" target="_blank" rel="noreferrer"><img loading="lazy" src="../${escapeHtml(scenario.stepImages[index])}" alt="Screen after step ${index + 1}" /></a>`
        : "";
      return `        <li class="step${step.error ? " failed" : ""}" data-step="${index}">
          <div class="step-copy">
            <div class="step-head">
              <span class="step-no">${String(index + 1).padStart(2, "0")}</span>
              ${keyword ? `<span class="kw ${kind}">${escapeHtml(keyword)}</span>` : ""}
              <span class="dur">${formatDuration(step.duration)}</span>
              <button class="seek" type="button" data-seek="${index}" title="Jump the video to this step">▶</button>
            </div>
            <p class="step-text">${escapeHtml(text)}</p>
            ${step.error ? `<pre class="error">${escapeHtml(step.error)}</pre>` : ""}
          </div>
          ${image}
        </li>`;
    })
    .join("\n");

  const video = scenario.videoPath
    ? `<video autoplay muted loop playsinline controls preload="auto" poster="../${escapeHtml(scenario.stepImages[0] ?? "")}" src="../${escapeHtml(scenario.videoPath)}" data-from-end="${scenario.contentFromEndMs}"></video>`
    : `<div class="no-video" style="padding:64px 0;text-align:center;color:var(--muted)">No recording for this run</div>`;

  const artifacts = [
    scenario.videoPath ? `<a href="../${escapeHtml(scenario.videoPath)}" download>Download video</a>` : "",
    scenario.tracePath
      ? `<a href="../${escapeHtml(scenario.tracePath)}" download>trace.zip</a> <span>open with <code>npx playwright show-trace</code></span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const brief =
    scenario.fields.length > 0
      ? `<dl class="brief">${scenario.fields
          .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.text)}</dd></div>`)
          .join("")}</dl>`
      : scenario.intent
        ? `<p class="intent"><span class="intent-label">Intent</span>${escapeHtml(scenario.intent)}</p>`
        : "";

  const chapters =
    scenario.timings && scenario.videoPath
      ? scenario.steps
          .map((step, index) => {
            const { keyword, text } = splitKeyword(step.title);
            const label = `${keyword ? `${keyword} ` : ""}${text}`;
            return `<button class="chapter" type="button" data-chapter="${index}" title="${escapeHtml(label)}"><span class="chapter-no">${index + 1}</span><span class="chapter-text">${escapeHtml(text)}</span></button>`;
          })
          .join("")
      : "";

  const timingsJson = scenario.timings ? JSON.stringify(scenario.timings).replace(/</g, "\\u003c") : "null";

  const body = `<main class="wrap">
  <section class="hero">
    <p class="eyebrow">${escapeHtml(scenario.feature)}</p>
    <h1>${escapeHtml(scenario.title)}</h1>
    <div class="meta-row">
      <span>${scenario.steps.length} steps</span>
      ${scenario.tags.map(tagChip).join("")}
    </div>
    ${brief}
  </section>

  <section class="panel video-panel">
    ${video}
    ${chapters ? `<div class="now" data-now>Step 1 / ${scenario.steps.length}</div><div class="chapters" data-chapters>${chapters}</div>` : ""}
    <div class="video-meta">${artifacts || "Artifacts unavailable"}</div>
  </section>

  <section class="panel steps-panel">
    <h2>Steps</h2>
    <ol class="steps-list">
${steps}
    </ol>
    ${scenario.error ? `<div class="failure"><h2>Failure</h2><pre>${escapeHtml(scenario.error)}</pre></div>` : ""}
  </section>

  ${runMeta()}
  <footer>Recorded from a real Pi agent session. Video is real-time; step screenshots show the screen at the end of each Gherkin step. Click a screenshot to open it full size.</footer>
</main>
<script type="application/json" id="timings">${timingsJson}</script>
<script>
(() => {
  const video = document.querySelector(".video-panel video");
  if (video) startAtContent(video);
  const data = JSON.parse(document.getElementById("timings").textContent || "null");
  if (!video || !data) return;
  const steps = data.steps;
  const chapters = [...document.querySelectorAll("[data-chapter]")];
  const rows = [...document.querySelectorAll("[data-step]")];
  const now = document.querySelector("[data-now]");
  let offsets = null;

  function computeOffsets() {
    if (offsets || !Number.isFinite(video.duration) || !video.duration) return offsets;
    const start = data.endedAt - video.duration * 1000;
    offsets = steps.map((step) => Math.max(0, Math.min(video.duration, (step.startedAt - start) / 1000)));
    return offsets;
  }

  function seek(index) {
    const list = computeOffsets();
    if (!list) return;
    video.currentTime = list[index] ?? 0;
    video.play().catch(() => {});
  }

  function label(index) {
    const text = chapters[index]?.querySelector(".chapter-text")?.textContent ?? "";
    return "Step " + (index + 1) + " / " + steps.length + " · " + text;
  }

  let active = -1;
  function highlight(index) {
    if (index === active) return;
    active = index;
    chapters.forEach((el, i) => el.toggleAttribute("aria-current", i === index));
    rows.forEach((el, i) => el.classList.toggle("current", i === index));
    if (now) now.textContent = label(index);
  }

  video.addEventListener("timeupdate", () => {
    const list = computeOffsets();
    if (!list) return;
    let index = 0;
    for (let i = 0; i < list.length; i += 1) if (video.currentTime + 0.05 >= list[i]) index = i;
    highlight(index);
  });

  for (const el of chapters) el.addEventListener("click", () => seek(Number(el.dataset.chapter)));
  for (const el of rows) {
    const button = el.querySelector("[data-seek]");
    if (button) button.addEventListener("click", () => seek(Number(button.dataset.seek)));
  }
})();
</script>
`;

  writeFileSync(
    path.join(stagingDir, "scenarios", `${scenario.id}.html`),
    shell({
      title: `${scenario.title} · ${scenario.feature}`,
      body,
      crumbs: `<a href="../index.html">All scenarios</a> / ${escapeHtml(scenario.feature)}`,
      root: "../",
    }),
  );
}

writeFileSync(
  path.join(stagingDir, "manifest.json"),
  JSON.stringify({
    generatedAt: run.generatedAt,
    commit: run.commit,
    dirty: run.dirty,
    stepHash,
    uiHash,
    featureHashes: Object.fromEntries(featureHashes),
    scenarios,
  }),
);

rmSync(outDir, { recursive: true, force: true });
renameSync(stagingDir, outDir);

console.log(
  `[gallery] ${scenarios.length} scenarios → ${path.relative(repoRoot, path.join(outDir, "index.html"))} (${run.counts.passed} passed, ${run.counts.failed} failed)`,
);
