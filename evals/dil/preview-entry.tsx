/**
 * Static preview of the last eval run, rendered through the product renderer.
 *
 * `preview.mjs` bundles this file with Vite (SSR), because the renderer imports through
 * the `@` alias and needs the real React component — the point is to see the answer the
 * way the transcript shows it, not to re-implement rendering in a script.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DilRenderer } from "../../src/web/src/components/dil/dil-renderer";
import { DIL_CASES } from "./cases.ts";
import { scoreCase } from "./scoring.ts";

// Built to `<repo>/.eval-preview-out/preview-entry.mjs`, so one level up is the repo.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "evals", "dil", "preview-out");

interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly diagnostics: string;
  readonly checks: readonly { readonly label: string; readonly pass: boolean }[];
}

interface Summary {
  readonly variant: string;
  readonly score: number;
  readonly cases: readonly CaseResult[];
}

interface Report {
  readonly model: string;
  readonly capturedAt?: string;
  readonly summary?: Summary;
  /** Shape written by the earlier with/without runner; still readable. */
  readonly summaries?: readonly Summary[];
}

function builtCss(): string {
  const assets = join(ROOT, "dist", "assets");
  const file = readdirSync(assets).find((name) => name.startsWith("index-") && name.endsWith(".css"));
  if (!file) throw new Error(`no built stylesheet in ${assets}; run npm run build:web first`);
  return readFileSync(join(assets, file), "utf8");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Default: the report the last live run wrote. `DIL_PREVIEW_SOURCE=recordings` scores the
 * committed recordings instead, so the preview works without a key or a fresh run.
 */
interface RecordingManifest {
  readonly model?: string;
  readonly harness?: string;
  readonly capturedAt?: string;
}

function fromRecordings(): Report {
  const cases = DIL_CASES.flatMap((dilCase) => {
    const file = join(ROOT, "evals", "dil", "recordings", `${dilCase.id}.md`);
    if (!existsSync(file)) return [];
    return [scoreCase(dilCase, readFileSync(file, "utf8"))];
  });
  const passed = cases.reduce((sum, item) => sum + item.passed, 0);
  const total = cases.reduce((sum, item) => sum + item.total, 0);

  const manifestFile = join(ROOT, "evals", "dil", "recordings", "manifest.json");
  const manifest: RecordingManifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, "utf8")) as RecordingManifest)
    : {};
  const captured = manifest.capturedAt ? ` · captured ${manifest.capturedAt.slice(0, 10)}` : " · no manifest";
  return {
    model: `${manifest.model ?? "recordings"} (recordings${captured})`,
    summary: { variant: "with-dil", cases, score: total === 0 ? 0 : Math.round((passed / total) * 100) },
  };
}

/** Every model in `reports/`, newest first; falls back to the latest single report. */
function fromReports(): Report[] {
  const dir = join(ROOT, "evals", "dil", "reports");
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
  const reports = files.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Report);
  if (reports.length > 0) {
    return reports.sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));
  }
  const latest = join(ROOT, "evals", "dil", "report.json");
  return existsSync(latest) ? [JSON.parse(readFileSync(latest, "utf8")) as Report] : [];
}

const reports: Report[] = process.env.DIL_PREVIEW_SOURCE === "recordings" ? [fromRecordings()] : fromReports();
if (reports.length === 0) throw new Error("no eval reports found; run npm run eval:dil first");

interface TocGroup {
  readonly variant: string;
  readonly label: string;
  readonly score: number;
  readonly items: readonly { readonly anchor: string; readonly label: string; readonly score: number }[];
}

const toc: TocGroup[] = [];
const entries = reports
  .map((report) => ({ model: report.model, summary: report.summary ?? report.summaries?.[0] }))
  .filter((entry): entry is { model: string; summary: Summary } => Boolean(entry.summary));

const sections = entries
  .map(({ model, summary }, reportIndex) => {
    const group: TocGroup = { variant: summary.variant, label: model, score: summary.score, items: [] };
    const items = [...group.items] as { anchor: string; label: string; score: number }[];
    const cases = summary.cases
      .map((result) => {
        const anchor = `case-${reportIndex}-${result.id}`;
        items.push({ anchor, label: result.id, score: result.score });
        const rendered = renderToStaticMarkup(
          <DilRenderer
            source={result.text}
            markdown={(text) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
          />,
        );
        const checks = result.checks
          .map(
            (check) =>
              `<li class="${check.pass ? "pass" : "fail"}">${check.pass ? "✓" : "✗"} ${escapeHtml(check.label)}</li>`,
          )
          .join("");
        return `<section class="case" id="${anchor}">
  <header>
    <h3>${escapeHtml(result.id)} <small>${escapeHtml(result.category)}</small></h3>
    <span class="score ${result.score === 100 ? "pass" : "fail"}">${result.score}% · ${result.passed}/${result.total}</span>
  </header>
  <ul class="checks">${checks}</ul>
  ${result.diagnostics === "clean" ? "" : `<p class="diagnostics">diagnostics: ${escapeHtml(result.diagnostics)}</p>`}
  <div class="render">${rendered}</div>
  <details><summary>raw source</summary><pre>${escapeHtml(result.text)}</pre></details>
</section>`;
      })
      .join("");
    toc.push({ ...group, label: model, items });
    return `<h2 id="model-${reportIndex}">${escapeHtml(model)} — ${summary.score}%</h2>${cases}`;
  })
  .join("");

const nav = `<nav class="toc" aria-label="Cases">
  <a class="top" href="#top">DIL eval</a>
  ${toc
    .map(
      (group) => `<div class="group">
    <h4 title="${escapeHtml(group.variant)}">${escapeHtml(group.label)} <span class="score ${group.score === 100 ? "pass" : "fail"}">${group.score}%</span></h4>
    <ul>${group.items
      .map(
        (item) =>
          `<li><a href="#${item.anchor}"><span>${escapeHtml(item.label)}</span><span class="score ${item.score === 100 ? "pass" : "fail"}">${item.score}%</span></a></li>`,
      )
      .join("")}</ul>
  </div>`,
    )
    .join("")}
</nav>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIL eval preview</title>
<style>${builtCss()}</style>
<style>
  /* The app stylesheet targets a full-height shell (body and #root at height 100%,
     body overflow hidden). This page is a long document, so undo the shell. */
  html, body { height: auto; min-height: 100%; overflow: visible; }
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 32px 20px 96px; }
  main { min-width: 0; }
  .toc { position: sticky; top: 24px; align-self: start; max-height: calc(100vh - 48px); overflow: auto; font-size: 12px; }
  .toc .top { display: block; font-weight: 600; margin-bottom: 12px; color: var(--foreground); text-decoration: none; }
  .toc h4 { margin: 16px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); }
  .toc h4 .score { text-transform: none; letter-spacing: 0; margin-left: 4px; }
  .toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .toc a { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; border-radius: 6px; color: var(--muted-foreground); text-decoration: none; }
  .toc a:hover { background: var(--muted); color: var(--foreground); }
  .toc .score { font-variant-numeric: tabular-nums; }
  .case { scroll-margin-top: 24px; }
  @media (max-width: 900px) {
    .layout { display: block; }
    .toc { position: static; max-height: none; margin-bottom: 20px; }
  }
  .meta { color: var(--muted-foreground); font-size: 13px; margin-bottom: 24px; }
  h2 { margin: 40px 0 12px; font-size: 18px; }
  .case { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  .case header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 15px; } h3 small { color: var(--muted-foreground); font-weight: 400; margin-left: 8px; }
  .score { font-variant-numeric: tabular-nums; font-weight: 600; }
  .checks { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 2px; font-size: 12px; }
  .checks .pass { color: #15803d; } .checks .fail { color: #b91c1c; }
  .score.pass { color: #15803d; } .score.fail { color: #b91c1c; }
  .diagnostics { color: #b45309; font-size: 12px; margin: 0 0 8px; }
  .render { border-top: 1px dashed var(--border); padding-top: 12px; }
  details { margin-top: 12px; font-size: 12px; } pre { white-space: pre-wrap; word-break: break-word; }
</style>
</head><body><div class="layout" id="top">
${nav}
<main>
<h1>DIL eval preview</h1>
<p class="meta">${reports.length} model${reports.length === 1 ? "" : "s"}: ${reports.map((report) => escapeHtml(report.model)).join(" · ")}<br>rendered with the product DIL renderer; Markdown answers use react-markdown as the fallback</p>
${sections}
</main>
</div></body></html>`;

mkdirSync(OUT, { recursive: true });
const file = join(OUT, "index.html");
writeFileSync(file, html);
process.stdout.write(`${file}\n`);
