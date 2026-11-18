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

interface Report {
  readonly model: string;
  readonly summaries: readonly {
    readonly variant: string;
    readonly score: number;
    readonly cases: readonly CaseResult[];
  }[];
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
function fromRecordings(): Report {
  const summaries = ["with", "without"].map((variant) => {
    const cases = DIL_CASES.flatMap((dilCase) => {
      const file = join(ROOT, "evals", "dil", "recordings", `${dilCase.id}.${variant}.md`);
      if (!existsSync(file)) return [];
      const scored = scoreCase(dilCase, readFileSync(file, "utf8"));
      return [{ ...scored, checks: scored.checks }];
    });
    const passed = cases.reduce((sum, item) => sum + item.passed, 0);
    const total = cases.reduce((sum, item) => sum + item.total, 0);
    return { variant, cases, score: total === 0 ? 0 : Math.round((passed / total) * 100) };
  });
  return { model: "recordings", summaries };
}

const report: Report =
  process.env.DIL_PREVIEW_SOURCE === "recordings"
    ? fromRecordings()
    : (JSON.parse(readFileSync(join(ROOT, "evals", "dil", "report.json"), "utf8")) as Report);

const sections = report.summaries
  .map((summary) => {
    const cases = summary.cases
      .map((result) => {
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
        return `<section class="case">
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
    return `<h2>${escapeHtml(summary.variant)} — ${summary.score}%</h2>${cases}`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIL eval preview — ${escapeHtml(report.model)}</title>
<style>${builtCss()}</style>
<style>
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 32px 20px 96px; }
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
</head><body><main>
<h1>DIL eval preview</h1>
<p class="meta">model: ${escapeHtml(report.model)} · rendered with the product DIL renderer; Markdown answers use react-markdown as the fallback</p>
${sections}
</main></body></html>`;

mkdirSync(OUT, { recursive: true });
const file = join(OUT, "index.html");
writeFileSync(file, html);
process.stdout.write(`${file}\n`);
