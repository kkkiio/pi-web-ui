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
import { DIL_PROMPT_EXAMPLES, DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";
import { DilRenderer } from "../../src/web/src/components/dil/dil-renderer";
import { parseDocument } from "../../src/web/src/core/dil/index.ts";
import type { DilDiagnostic } from "../../src/web/src/core/dil/types.ts";
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
  readonly toolCallCount?: number;
  readonly assistantTurns?: number;
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

function normalizeSource(source: string): string {
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  return withoutBom.includes("\r") ? withoutBom.replace(/\r\n?/g, "\n") : withoutBom;
}

function describeDiagnostic(diag: DilDiagnostic): string {
  const parts: string[] = [];
  if (diag.expected && diag.found) {
    parts.push(`expected ${diag.expected}, found ${diag.found}`);
  } else if (diag.expected) {
    parts.push(`expected ${diag.expected}`);
  } else if (diag.found) {
    parts.push(`found ${diag.found}`);
  }
  if (diag.tag && !parts.some((p) => p.includes(diag.tag ?? ""))) parts.push(`<${diag.tag}>`);
  if (diag.directive) parts.push(`{#${diag.directive}}`);
  if (diag.name) parts.push(`attr "${diag.name}"`);
  if (diag.fence) parts.push(`fence ${diag.fence}`);
  if (diag.action) parts.push(`recovery: ${diag.action}`);
  return parts.join(" · ");
}

function renderDiagnosticsPanel(
  anchor: string,
  sourceLines: readonly string[],
  diagnostics: readonly DilDiagnostic[],
): string {
  if (diagnostics.length === 0) return "";
  const items = diagnostics
    .map((diag) => {
      const detail = describeDiagnostic(diag);
      const lineText = sourceLines[diag.line - 1] ?? "";
      const col = Math.max(1, diag.column);
      const caret = `${" ".repeat(Math.max(0, col - 1))}^`;
      const targetId = `${anchor}-L${diag.line}`;
      return `<li>
        <div class="diag-head">
          <a class="diag-loc" href="#${targetId}">L${diag.line}:${col}</a>
          <code class="diag-code">${escapeHtml(diag.code)}</code>
          ${detail ? `<span class="diag-detail">${escapeHtml(detail)}</span>` : ""}
        </div>
        <pre class="diag-snippet"><code>${escapeHtml(lineText)}\n<span class="diag-caret">${caret}</span></code></pre>
      </li>`;
    })
    .join("");
  return `<div class="diagnostics-box">
    <div class="diagnostics-title">Diagnostics (${diagnostics.length})</div>
    <ul class="diagnostics-list">${items}</ul>
  </div>`;
}

function renderNumberedSource(
  anchor: string,
  sourceLines: readonly string[],
  diagnostics: readonly DilDiagnostic[],
): string {
  const byLine = new Map<number, DilDiagnostic[]>();
  for (const diag of diagnostics) {
    const list = byLine.get(diag.line) ?? [];
    list.push(diag);
    byLine.set(diag.line, list);
  }

  const rows = sourceLines
    .map((lineText, idx) => {
      const lineNo = idx + 1;
      const lineDiags = byLine.get(lineNo);
      const hasErr = Boolean(lineDiags && lineDiags.length > 0);
      const note = lineDiags
        ? lineDiags
            .map((diag) => {
              const detail = describeDiagnostic(diag);
              const col = Math.max(1, diag.column);
              const caret = `${" ".repeat(Math.max(0, col - 1))}^ ${diag.code}${detail ? `: ${detail}` : ""}`;
              return `<div class="src-diag-note"><span class="ln"></span><span class="code">${escapeHtml(caret)}</span></div>`;
            })
            .join("")
        : "";
      return `<div class="src-line${hasErr ? " has-diag" : ""}" id="${anchor}-L${lineNo}"><span class="ln">${lineNo}</span><span class="code">${escapeHtml(lineText) || " "}</span></div>${note}`;
    })
    .join("");

  return `<div class="src-view">${rows}</div>`;
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

function writeExamplesPreview(): void {
  const examples = Object.entries(DIL_PROMPT_EXAMPLES);
  const cards = examples
    .map(([name, source]) => {
      const anchor = `example-${name}`;
      const rendered = renderToStaticMarkup(<DilRenderer source={source} />);
      const parsed = parseDocument(source);
      const sourceLines = normalizeSource(source).split("\n");
      const diagPanel = renderDiagnosticsPanel(anchor, sourceLines, parsed.diagnostics);
      const numberedSource = renderNumberedSource(anchor, sourceLines, parsed.diagnostics);
      const hasDiagnostics = parsed.diagnostics.length > 0;
      const status = hasDiagnostics
        ? `<span class="score fail">${parsed.diagnostics.length} diagnostics</span>`
        : `<span class="score pass">clean · ${sourceLines.length} lines</span>`;
      return `<section class="case" id="${anchor}">
  <header class="case-head">
    <h3>${escapeHtml(name)} <small>extensions/${escapeHtml(name)}.dil.md</small></h3>
    <div class="case-stats">${status}</div>
  </header>
  ${diagPanel}
  <div class="render preview-frame">${rendered}</div>
  <details class="raw"${hasDiagnostics ? " open" : ""}>
    <summary>raw source (${sourceLines.length} lines)</summary>
    ${numberedSource}
  </details>
</section>`;
    })
    .join("");

  const tocItems = examples
    .map(([name]) => `<li><a href="#example-${escapeHtml(name)}"><span>${escapeHtml(name)}</span></a></li>`)
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIL prompt examples preview</title>
<style>${builtCss()}</style>
<style>
  html, body { height: auto; min-height: 100%; overflow: visible; }
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 40px; max-width: 1120px; margin: 0 auto; padding: 32px 24px 96px; }
  main { min-width: 0; }
  .toc { position: sticky; top: 24px; align-self: start; font-size: 12px; }
  .toc .top { display: block; font-weight: 600; margin-bottom: 12px; color: var(--foreground); text-decoration: none; }
  .toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .toc a { display: flex; justify-content: space-between; padding: 4px 8px; border-radius: 6px; color: var(--muted-foreground); text-decoration: none; }
  .toc a:hover { background: var(--muted); color: var(--foreground); }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 24px; }
  .toolbar button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); cursor: pointer; }
  .toolbar button.active { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
  .toolbar .sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
  .preview-frame { max-width: var(--frame-width, 680px); transition: max-width 150ms ease; }
  .case { scroll-margin-top: 24px; border-top: 1px solid var(--border); padding-top: 24px; margin-top: 28px; }
  .case-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .case-stats { display: flex; align-items: baseline; gap: 12px; flex-shrink: 0; }
  h3 { margin: 0; font-size: 16px; } h3 small { color: var(--muted-foreground); font-weight: 400; margin-left: 8px; font-size: 12px; }
  .score { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12px; }
  .score.pass { color: #15803d; } .score.fail { color: #b91c1c; }
  .diagnostics-box { margin: 0 0 16px; padding: 10px 12px; border-left: 3px solid #d97706; background: color-mix(in srgb, #f59e0b 8%, transparent); border-radius: 0 8px 8px 0; font-size: 12px; }
  .diagnostics-title { font-weight: 600; color: #b45309; margin-bottom: 8px; }
  .diagnostics-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .diag-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .diag-loc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; color: #b45309; }
  .diag-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, #f59e0b 16%, transparent); color: #92400e; }
  .diag-snippet { margin: 0; padding: 6px 8px; border-radius: 6px; background: var(--background); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; overflow-x: auto; white-space: pre; }
  .diag-caret { color: #dc2626; font-weight: 700; }
  .render { margin: 16px 0; }
  details { margin-top: 14px; font-size: 12px; }
  details > summary { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; color: var(--muted-foreground); font-size: 12px; font-weight: 500; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; }
  details[open] > summary::before { content: "▾"; }
  details > summary:hover { color: var(--foreground); }
  .src-view { margin-top: 8px; padding: 10px 0; border-radius: 8px; background: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; overflow-x: auto; }
  .src-line, .src-diag-note { display: grid; grid-template-columns: 44px minmax(0, 1fr); padding: 0 12px 0 4px; }
  .src-line .ln { text-align: right; padding-right: 12px; color: var(--muted-foreground); user-select: none; font-variant-numeric: tabular-nums; }
  .src-line .code { white-space: pre-wrap; word-break: break-word; }
  .src-line.has-diag { background: color-mix(in srgb, #f59e0b 16%, transparent); }
  .src-diag-note { color: #b91c1c; font-weight: 600; background: color-mix(in srgb, #ef4444 8%, transparent); padding-bottom: 2px; }
  @media (max-width: 900px) { .layout { display: block; } .toc { position: static; margin-bottom: 20px; } }
</style>
</head><body><div class="layout" id="top">
<nav class="toc" aria-label="Examples">
  <a class="top" href="#top">Prompt examples</a>
  <ul>${tocItems}</ul>
</nav>
<main>
<h1>DIL prompt examples</h1>
<div class="toolbar">
  <button type="button" data-width="680px" class="active">Desktop (680px)</button>
  <button type="button" data-width="375px">Mobile (375px)</button>
  <button type="button" data-width="100%">Full</button>
  <span class="sep"></span>
  <button type="button" id="theme-toggle">Toggle dark</button>
</div>
${cards}
</main>
</div>
<script>
  for (const btn of document.querySelectorAll("[data-width]")) {
    btn.addEventListener("click", () => {
      document.documentElement.style.setProperty("--frame-width", btn.dataset.width);
      for (const b of document.querySelectorAll("[data-width]")) b.classList.toggle("active", b === btn);
    });
  }
  document.getElementById("theme-toggle").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
  });
</script>
</body></html>`;

  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "examples.html");
  writeFileSync(file, html);
  process.stdout.write(`${file}\n`);
}

if (process.env.DIL_PREVIEW_SOURCE === "examples") {
  writeExamplesPreview();
  process.exit(0);
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
        const rendered = renderToStaticMarkup(<DilRenderer source={result.text} />);
        const parsed = parseDocument(result.text);
        const sourceLines = normalizeSource(result.text).split("\n");
        const checks = result.checks
          .map(
            (check) =>
              `<li class="${check.pass ? "pass" : "fail"}">${check.pass ? "✓" : "✗"} ${escapeHtml(check.label)}</li>`,
          )
          .join("");
        const definition = DIL_CASES.find((candidate) => candidate.id === result.id);
        const traceBits: string[] = [];
        if (result.toolCallCount !== undefined) traceBits.push(`${result.toolCallCount} tools`);
        if (result.assistantTurns !== undefined) traceBits.push(`${result.assistantTurns} turns`);
        const traceMeta = traceBits.length > 0 ? `<span class="trace">${escapeHtml(traceBits.join(" · "))}</span>` : "";
        const input = definition
          ? `<blockquote class="prompt-quote">
    <p class="prompt-text">${escapeHtml(definition.prompt)}</p>
    <p class="why">${escapeHtml(definition.why)}</p>
  </blockquote>`
          : "";
        const diagPanel = renderDiagnosticsPanel(anchor, sourceLines, parsed.diagnostics);
        const numberedSource = renderNumberedSource(anchor, sourceLines, parsed.diagnostics);
        const hasDiagnostics = parsed.diagnostics.length > 0;
        return `<section class="case" id="${anchor}" data-model="${reportIndex}" data-model-label="${escapeHtml(model)}" data-case-label="${escapeHtml(result.id)}">
  <div class="case-model-row"><span class="model-pill">${escapeHtml(model)}</span></div>
  <header class="case-head">
    <h3>${escapeHtml(result.id)} <small>${escapeHtml(result.category)}</small></h3>
    <div class="case-stats">
      ${traceMeta}
      <span class="score ${result.score === 100 ? "pass" : "fail"}">${result.score}% · ${result.passed}/${result.total}</span>
    </div>
  </header>
  ${input}
  <ul class="checks">${checks}</ul>
  ${diagPanel}
  <div class="render">${rendered}</div>
  <details class="raw"${hasDiagnostics ? " open" : ""}>
    <summary>raw source (${sourceLines.length} lines${hasDiagnostics ? ` · ${parsed.diagnostics.length} diagnostics` : ""})</summary>
    ${numberedSource}
  </details>
</section>`;
      })
      .join("");
    toc.push({ ...group, label: model, items });
    return `<section class="model-section" data-model="${reportIndex}"><h2 id="model-${reportIndex}">${escapeHtml(model)} <span class="score ${summary.score === 100 ? "pass" : "fail"}">${summary.score}%</span></h2>${cases}</section>`;
  })
  .join("");

const nav = `<nav class="toc" aria-label="Cases">
  <a class="top" href="#top">DIL eval</a>
  ${toc
    .map(
      (group, groupIndex) => `<div class="group" data-model="${groupIndex}">
    <a class="group-head" href="#model-${groupIndex}" title="${escapeHtml(group.variant)}"><span>${escapeHtml(group.label)}</span><span class="score ${group.score === 100 ? "pass" : "fail"}">${group.score}%</span></a>
    <ul>${group.items
      .map(
        (item) =>
          `<li><a href="#${item.anchor}" data-toc-for="${item.anchor}"><span>${escapeHtml(item.label)}</span><span class="score ${item.score === 100 ? "pass" : "fail"}">${item.score}%</span></a></li>`,
      )
      .join("")}</ul>
  </div>`,
    )
    .join("")}
</nav>`;

const modelFilters =
  entries.length > 1
    ? `<div class="filter-bar" role="tablist" aria-label="Filter by model">
  <button type="button" class="filter-btn active" data-filter="all">All (${entries.length})</button>
  ${entries
    .map(
      ({ model, summary }, idx) =>
        `<button type="button" class="filter-btn" data-filter="${idx}">${escapeHtml(model)} <span class="score ${summary.score === 100 ? "pass" : "fail"}">${summary.score}%</span></button>`,
    )
    .join("")}
</div>`
    : "";

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
  .layout { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 36px; max-width: 1220px; margin: 0 auto; padding: 32px 24px 96px; }
  main { min-width: 0; }
  .toc { position: sticky; top: 24px; align-self: start; max-height: calc(100vh - 48px); overflow: auto; font-size: 12px; }
  .toc .top { display: block; font-weight: 600; margin-bottom: 12px; color: var(--foreground); text-decoration: none; }
  .toc .group { margin-top: 14px; padding-left: 8px; border-left: 2px solid transparent; transition: border-color 120ms ease; }
  .toc .group.active { border-left-color: var(--primary); }
  .toc .group.hidden { display: none; }
  .toc .group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; padding: 3px 6px; margin-bottom: 4px; border-radius: 6px; font-size: 11px; font-weight: 600; letter-spacing: .01em; color: var(--muted-foreground); text-decoration: none; word-break: break-word; }
  .toc .group.active .group-head { color: var(--foreground); }
  .toc .group-head:hover { background: var(--muted); color: var(--foreground); }
  .toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .toc li a { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; border-radius: 6px; color: var(--muted-foreground); text-decoration: none; }
  .toc li a:hover { background: var(--muted); color: var(--foreground); }
  .toc li a.active { background: var(--muted); color: var(--foreground); font-weight: 600; }
  .toc .score { font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .sticky-context { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; margin: 0 -12px 16px; background: color-mix(in srgb, var(--background) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); font-size: 12px; }
  .sticky-context .ctx-trail { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
  .sticky-context .ctx-case { font-weight: 600; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sticky-context .ctx-sep { color: var(--muted-foreground); }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 20px; }
  .filter-btn { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--background); color: var(--muted-foreground); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .filter-btn:hover { color: var(--foreground); background: var(--muted); }
  .filter-btn.active { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
  .filter-btn.active .score { color: inherit; opacity: .9; }
  .model-section.hidden { display: none; }
  .case-model-row { margin-bottom: 6px; }
  .model-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: var(--muted); border: 1px solid var(--border); font-size: 11px; font-weight: 500; color: var(--foreground); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  @media (max-width: 900px) {
    .layout { display: block; }
    .toc { position: static; max-height: none; margin-bottom: 20px; }
  }
  .meta { color: var(--muted-foreground); font-size: 13px; margin: 8px 0 16px; }
  h2 { scroll-margin-top: 56px; margin: 40px 0 8px; font-size: 18px; display: flex; align-items: baseline; gap: 10px; }
  .case { scroll-margin-top: 56px; border-top: 1px solid var(--border); padding-top: 24px; margin-top: 28px; }
  .case-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  .case-stats { display: flex; align-items: baseline; gap: 12px; flex-shrink: 0; }
  .trace { font-size: 12px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  h3 { margin: 0; font-size: 16px; } h3 small { color: var(--muted-foreground); font-weight: 400; margin-left: 8px; font-size: 12px; }
  .score { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; }
  .score.pass { color: #15803d; } .score.fail { color: #b91c1c; }
  .prompt-quote { margin: 0 0 12px; padding: 2px 0 2px 12px; border-left: 2px solid var(--border); }
  .prompt-text { margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .why { margin: 4px 0 0; font-size: 12px; color: var(--muted-foreground); }
  .checks { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; }
  .checks .pass { color: #15803d; } .checks .fail { color: #b91c1c; font-weight: 500; }
  .system { margin-bottom: 16px; font-size: 12px; }
  .system pre { margin: 8px 0 0; padding: 12px; border-radius: 8px; background: var(--muted); white-space: pre-wrap; max-height: 320px; overflow: auto; }
  .diagnostics-box { margin: 0 0 16px; padding: 10px 12px; border-left: 3px solid #d97706; background: color-mix(in srgb, #f59e0b 8%, transparent); border-radius: 0 8px 8px 0; font-size: 12px; }
  .diagnostics-title { font-weight: 600; color: #b45309; margin-bottom: 8px; }
  .diagnostics-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .diag-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .diag-loc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; color: #b45309; text-decoration: underline; text-underline-offset: 2px; }
  .diag-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, #f59e0b 16%, transparent); color: #92400e; }
  .diag-detail { color: var(--foreground); }
  .diag-snippet { margin: 0; padding: 6px 8px; border-radius: 6px; background: var(--background); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; overflow-x: auto; white-space: pre; }
  .diag-caret { color: #dc2626; font-weight: 700; }
  .render { margin: 16px 0; }
  details { margin-top: 14px; font-size: 12px; }
  details > summary { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; color: var(--muted-foreground); font-size: 12px; font-weight: 500; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; }
  details[open] > summary::before { content: "▾"; }
  details > summary:hover { color: var(--foreground); }
  .src-view { margin-top: 8px; padding: 10px 0; border-radius: 8px; background: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; overflow-x: auto; }
  .src-line, .src-diag-note { display: grid; grid-template-columns: 44px minmax(0, 1fr); padding: 0 12px 0 4px; }
  .src-line { scroll-margin-top: 40px; }
  .src-line .ln { text-align: right; padding-right: 12px; color: var(--muted-foreground); user-select: none; font-variant-numeric: tabular-nums; }
  .src-line .code { white-space: pre-wrap; word-break: break-word; }
  .src-line.has-diag { background: color-mix(in srgb, #f59e0b 16%, transparent); }
  .src-line.has-diag .ln { color: #b45309; font-weight: 600; }
  .src-diag-note { color: #b91c1c; font-weight: 600; background: color-mix(in srgb, #ef4444 8%, transparent); padding-bottom: 2px; }
  .src-diag-note .code { white-space: pre; overflow-x: auto; }
</style>
</head><body><div class="layout" id="top">
${nav}
<main>
<div class="sticky-context" id="sticky-context" hidden>
  <div class="ctx-trail">
    <span class="model-pill" id="ctx-model"></span>
    <span class="ctx-sep">/</span>
    <span class="ctx-case" id="ctx-case"></span>
  </div>
</div>
<h1>DIL eval preview</h1>
<details class="system"><summary>system prompt section &lt;dil&gt;</summary><pre>${escapeHtml(DIL_SYSTEM_PROMPT)}</pre></details>
<p class="meta">${reports.length} model${reports.length === 1 ? "" : "s"}: ${reports.map((report) => escapeHtml(report.model)).join(" · ")}<br>rendered with the product DIL renderer; Markdown answers use react-markdown as the fallback</p>
${modelFilters}
${sections}
</main>
</div>
<script>
  const cases = Array.from(document.querySelectorAll("section.case"));
  const tocLinks = new Map(Array.from(document.querySelectorAll("[data-toc-for]")).map((a) => [a.dataset.tocFor, a]));
  const tocGroups = Array.from(document.querySelectorAll(".toc .group"));
  const stickyBar = document.getElementById("sticky-context");
  const ctxModel = document.getElementById("ctx-model");
  const ctxCase = document.getElementById("ctx-case");

  function setActiveCase(el) {
    if (!el) return;
    const id = el.id;
    const modelIdx = el.dataset.model;
    for (const a of tocLinks.values()) a.classList.toggle("active", a.dataset.tocFor === id);
    for (const g of tocGroups) g.classList.toggle("active", g.dataset.model === modelIdx);
    const activeLink = tocLinks.get(id);
    if (activeLink) activeLink.scrollIntoView({ block: "nearest" });
    if (stickyBar && ctxModel && ctxCase) {
      stickyBar.hidden = false;
      ctxModel.textContent = el.dataset.modelLabel || "";
      ctxCase.textContent = el.dataset.caseLabel || "";
    }
  }

  function syncActiveFromScroll() {
    const visible = cases.filter((el) => !el.closest(".model-section.hidden"));
    if (visible.length === 0) return;
    const threshold = 110;
    let current = visible[0];
    for (const el of visible) {
      if (el.getBoundingClientRect().top <= threshold) current = el;
      else break;
    }
    setActiveCase(current);
  }

  let raf = 0;
  window.addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      syncActiveFromScroll();
    });
  }, { passive: true });
  syncActiveFromScroll();

  for (const btn of document.querySelectorAll("[data-filter]")) {
    btn.addEventListener("click", () => {
      const target = btn.dataset.filter;
      for (const b of document.querySelectorAll("[data-filter]")) b.classList.toggle("active", b === btn);
      for (const sec of document.querySelectorAll(".model-section")) {
        sec.classList.toggle("hidden", target !== "all" && sec.dataset.model !== target);
      }
      for (const g of tocGroups) {
        g.classList.toggle("hidden", target !== "all" && g.dataset.model !== target);
      }
      syncActiveFromScroll();
    });
  }
</script>
</body></html>`;

mkdirSync(OUT, { recursive: true });
const file = join(OUT, "index.html");
writeFileSync(file, html);
process.stdout.write(`${file}\n`);
