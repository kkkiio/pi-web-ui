import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DilRenderer } from "../../../src/web/src/components/dil/dil-renderer";
import { parseDocument } from "../../../src/web/src/core/dil/index";
import type { DilDiagnostic } from "../../../src/web/src/core/dil/types";
import type {
  CaseDefinition,
  CaseResult,
  ExamplesPreviewData,
  PreviewData,
  ReportsPreviewData,
  Summary,
} from "./types";

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

function DiagnosticsPanel({
  anchor,
  sourceLines,
  diagnostics,
}: {
  readonly anchor: string;
  readonly sourceLines: readonly string[];
  readonly diagnostics: readonly DilDiagnostic[];
}) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="diagnostics-box">
      <div className="diagnostics-title">Diagnostics ({diagnostics.length})</div>
      <ul className="diagnostics-list">
        {diagnostics.map((diag) => {
          const detail = describeDiagnostic(diag);
          const lineText = sourceLines[diag.line - 1] ?? "";
          const col = Math.max(1, diag.column);
          const caret = `${" ".repeat(Math.max(0, col - 1))}^`;
          return (
            <li key={`${diag.code}-${diag.line}-${diag.column}-${detail}`}>
              <div className="diag-head">
                <a className="diag-loc" href={`#${anchor}-L${diag.line}`}>
                  L{diag.line}:{col}
                </a>
                <code className="diag-code">{diag.code}</code>
                {detail ? <span className="diag-detail">{detail}</span> : null}
              </div>
              <pre className="diag-snippet">
                <code>
                  {lineText}
                  {"\n"}
                  <span className="diag-caret">{caret}</span>
                </code>
              </pre>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NumberedSource({
  anchor,
  sourceLines,
  diagnostics,
}: {
  readonly anchor: string;
  readonly sourceLines: readonly string[];
  readonly diagnostics: readonly DilDiagnostic[];
}) {
  const byLine = useMemo(() => {
    const map = new Map<number, DilDiagnostic[]>();
    for (const diag of diagnostics) {
      const list = map.get(diag.line) ?? [];
      list.push(diag);
      map.set(diag.line, list);
    }
    return map;
  }, [diagnostics]);

  return (
    <div className="src-view">
      {sourceLines.map((lineText, idx) => {
        const lineNo = idx + 1;
        const lineDiags = byLine.get(lineNo);
        const hasErr = Boolean(lineDiags && lineDiags.length > 0);
        return (
          <Fragment key={lineNo}>
            <div className={`src-line${hasErr ? " has-diag" : ""}`} id={`${anchor}-L${lineNo}`}>
              <span className="ln">{lineNo}</span>
              <span className="code">{lineText || " "}</span>
            </div>
            {lineDiags?.map((diag) => {
              const detail = describeDiagnostic(diag);
              const col = Math.max(1, diag.column);
              const caret = `${" ".repeat(Math.max(0, col - 1))}^ ${diag.code}${detail ? `: ${detail}` : ""}`;
              return (
                <div className="src-diag-note" key={`${lineNo}-${diag.code}-${diag.column}-${detail}`}>
                  <span className="ln" />
                  <span className="code">{caret}</span>
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

function ExampleCard({ name, source }: { readonly name: string; readonly source: string }) {
  const anchor = `example-${name}`;
  const parsed = useMemo(() => parseDocument(source), [source]);
  const sourceLines = useMemo(() => normalizeSource(source).split("\n"), [source]);
  const hasDiagnostics = parsed.diagnostics.length > 0;

  return (
    <section className="case" id={anchor}>
      <header className="case-head">
        <h3>
          {name} <small>extensions/{name}.dil.md</small>
        </h3>
        <div className="case-stats">
          {hasDiagnostics ? (
            <span className="score fail">{parsed.diagnostics.length} diagnostics</span>
          ) : (
            <span className="score pass">clean · {sourceLines.length} lines</span>
          )}
        </div>
      </header>
      <DiagnosticsPanel anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
      <div className="render preview-frame">
        <DilRenderer source={source} />
      </div>
      <details className="raw" open={hasDiagnostics}>
        <summary>raw source ({sourceLines.length} lines)</summary>
        <NumberedSource anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
      </details>
    </section>
  );
}

function ExamplesView({ data }: { readonly data: ExamplesPreviewData }) {
  const [frameWidth, setFrameWidth] = useState("680px");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.title = "DIL prompt examples preview";
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="layout layout--examples" id="top" style={{ "--frame-width": frameWidth } as React.CSSProperties}>
      <nav className="toc" aria-label="Examples">
        <a className="top" href="#top">
          Prompt examples
        </a>
        <ul>
          {data.examples.map(({ name }) => (
            <li key={name}>
              <a href={`#example-${name}`}>
                <span>{name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <h1>DIL prompt examples</h1>
        <div className="toolbar">
          {(
            [
              ["680px", "Desktop (680px)"],
              ["375px", "Mobile (375px)"],
              ["100%", "Full"],
            ] as const
          ).map(([width, label]) => (
            <button
              key={width}
              type="button"
              className={frameWidth === width ? "active" : undefined}
              onClick={() => setFrameWidth(width)}
            >
              {label}
            </button>
          ))}
          <span className="sep" />
          <button type="button" onClick={() => setDark((prev) => !prev)}>
            {dark ? "Toggle light" : "Toggle dark"}
          </button>
        </div>
        {data.examples.map(({ name, source }) => (
          <ExampleCard key={name} name={name} source={source} />
        ))}
      </main>
    </div>
  );
}

function CaseCard({
  anchor,
  model,
  result,
  definition,
}: {
  readonly anchor: string;
  readonly model: string;
  readonly result: CaseResult;
  readonly definition?: CaseDefinition;
}) {
  const parsed = useMemo(() => parseDocument(result.text), [result.text]);
  const sourceLines = useMemo(() => normalizeSource(result.text).split("\n"), [result.text]);
  const hasDiagnostics = parsed.diagnostics.length > 0;

  const traceBits: string[] = [];
  if (result.toolCallCount !== undefined) traceBits.push(`${result.toolCallCount} tools`);
  if (result.assistantTurns !== undefined) traceBits.push(`${result.assistantTurns} turns`);

  return (
    <section className="case" id={anchor} data-case-anchor={anchor}>
      <div className="case-model-row">
        <span className="model-pill">{model}</span>
      </div>
      <header className="case-head">
        <h3>
          {result.id} <small>{result.category}</small>
        </h3>
        <div className="case-stats">
          {traceBits.length > 0 ? <span className="trace">{traceBits.join(" · ")}</span> : null}
          <span className={`score ${result.score === 100 ? "pass" : "fail"}`}>
            {result.score}% · {result.passed}/{result.total}
          </span>
        </div>
      </header>
      {definition ? (
        <blockquote className="prompt-quote">
          <p className="prompt-text">{definition.prompt}</p>
          <p className="why">{definition.why}</p>
        </blockquote>
      ) : null}
      <ul className="checks">
        {result.checks.map((check) => (
          <li key={check.label} className={check.pass ? "pass" : "fail"}>
            {check.pass ? "✓" : "✗"} {check.label}
          </li>
        ))}
      </ul>
      <DiagnosticsPanel anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
      <div className="render">
        <DilRenderer source={result.text} />
      </div>
      <details className="raw" open={hasDiagnostics}>
        <summary>
          raw source ({sourceLines.length} lines
          {hasDiagnostics ? ` · ${parsed.diagnostics.length} diagnostics` : ""})
        </summary>
        <NumberedSource anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
      </details>
    </section>
  );
}

interface ReportEntry {
  readonly model: string;
  readonly summary: Summary;
}

function ReportsView({ data }: { readonly data: ReportsPreviewData }) {
  const entries = useMemo<ReportEntry[]>(
    () =>
      data.reports
        .map((report) => ({ model: report.model, summary: report.summary ?? report.summaries?.[0] }))
        .filter((entry): entry is ReportEntry => Boolean(entry.summary)),
    [data.reports],
  );

  const [filter, setFilter] = useState<number | "all">("all");
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const tocLinkRefs = useRef(new Map<string, HTMLAnchorElement>());

  const visibleEntries = useMemo(
    () =>
      entries
        .map((entry, idx) => ({ ...entry, reportIndex: idx }))
        .filter((entry) => filter === "all" || entry.reportIndex === filter),
    [entries, filter],
  );

  const activeContext = useMemo(() => {
    if (!activeAnchor) return null;
    for (const entry of visibleEntries) {
      for (const item of entry.summary.cases) {
        const anchor = `case-${entry.reportIndex}-${item.id}`;
        if (anchor === activeAnchor) {
          return { model: entry.model, caseId: item.id, reportIndex: entry.reportIndex };
        }
      }
    }
    return null;
  }, [activeAnchor, visibleEntries]);

  useEffect(() => {
    document.title = "DIL eval preview";
  }, []);

  useEffect(() => {
    function syncActiveFromScroll() {
      const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-case-anchor]"));
      if (elements.length === 0) return;
      const threshold = 110;
      let current = elements[0];
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= threshold) current = el;
        else break;
      }
      const next = current.dataset.caseAnchor ?? null;
      setActiveAnchor((prev) => (prev === next ? prev : next));
    }

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncActiveFromScroll();
      });
    }

    syncActiveFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function handleSelectFilter(nextFilter: number | "all") {
    setFilter(nextFilter);
    requestAnimationFrame(() => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-case-anchor]"));
      if (elements.length === 0) return;
      const threshold = 110;
      let current = elements[0];
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= threshold) current = el;
        else break;
      }
      setActiveAnchor(current.dataset.caseAnchor ?? null);
    });
  }

  useEffect(() => {
    if (!activeAnchor) return;
    tocLinkRefs.current.get(activeAnchor)?.scrollIntoView({ block: "nearest" });
  }, [activeAnchor]);

  return (
    <div className="layout" id="top">
      <nav className="toc" aria-label="Cases">
        <a className="top" href="#top">
          DIL eval
        </a>
        {visibleEntries.map(({ model, summary, reportIndex }) => {
          const isGroupActive = activeContext?.reportIndex === reportIndex;
          return (
            <div key={reportIndex} className={`group${isGroupActive ? " active" : ""}`}>
              <a className="group-head" href={`#model-${reportIndex}`} title={summary.variant}>
                <span>{model}</span>
                <span className={`score ${summary.score === 100 ? "pass" : "fail"}`}>{summary.score}%</span>
              </a>
              <ul>
                {summary.cases.map((item) => {
                  const anchor = `case-${reportIndex}-${item.id}`;
                  const isActive = activeAnchor === anchor;
                  return (
                    <li key={anchor}>
                      <a
                        href={`#${anchor}`}
                        className={isActive ? "active" : undefined}
                        ref={(el) => {
                          if (el) tocLinkRefs.current.set(anchor, el);
                          else tocLinkRefs.current.delete(anchor);
                        }}
                      >
                        <span>{item.id}</span>
                        <span className={`score ${item.score === 100 ? "pass" : "fail"}`}>{item.score}%</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <main>
        {activeContext ? (
          <div className="sticky-context">
            <div className="ctx-trail">
              <span className="model-pill">{activeContext.model}</span>
              <span className="ctx-sep">/</span>
              <span className="ctx-case">{activeContext.caseId}</span>
            </div>
          </div>
        ) : null}
        <h1>DIL eval preview</h1>
        <details className="system">
          <summary>system prompt section &lt;dil&gt;</summary>
          <pre>{data.systemPrompt}</pre>
        </details>
        <p className="meta">
          {entries.length} model{entries.length === 1 ? "" : "s"}: {entries.map((entry) => entry.model).join(" · ")}
          <br />
          rendered with the product DIL renderer; Markdown answers use react-markdown as the fallback
        </p>
        {entries.length > 1 ? (
          <div className="filter-bar" role="tablist" aria-label="Filter by model">
            <button
              type="button"
              className={`filter-btn${filter === "all" ? " active" : ""}`}
              onClick={() => handleSelectFilter("all")}
            >
              All ({entries.length})
            </button>
            {entries.map(({ model, summary }, idx) => (
              <button
                key={`${model}-${summary.variant}`}
                type="button"
                className={`filter-btn${filter === idx ? " active" : ""}`}
                onClick={() => handleSelectFilter(idx)}
              >
                {model} <span className={`score ${summary.score === 100 ? "pass" : "fail"}`}>{summary.score}%</span>
              </button>
            ))}
          </div>
        ) : null}
        {visibleEntries.map(({ model, summary, reportIndex }) => (
          <section key={reportIndex} className="model-section">
            <h2 id={`model-${reportIndex}`}>
              {model} <span className={`score ${summary.score === 100 ? "pass" : "fail"}`}>{summary.score}%</span>
            </h2>
            {summary.cases.map((result) => {
              const anchor = `case-${reportIndex}-${result.id}`;
              return (
                <CaseCard
                  key={anchor}
                  anchor={anchor}
                  model={model}
                  result={result}
                  definition={data.definitions[result.id]}
                />
              );
            })}
          </section>
        ))}
      </main>
    </div>
  );
}

export function App({ data }: { readonly data: PreviewData }) {
  if (data.mode === "examples") {
    return <ExamplesView data={data} />;
  }
  return <ReportsView data={data} />;
}
