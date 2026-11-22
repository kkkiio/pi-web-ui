import { CheckIcon, CopyIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Message, MessageContent } from "../../../src/web/components/ai-elements/message";
import { DilRenderer } from "../../../src/web/src/components/dil/dil-renderer";
import { ChatItemView } from "../../../src/web/src/components/pi-web-ui/chat-item-view";
import { groupTranscript, ProcessGroup } from "../../../src/web/src/components/pi-web-ui/process-group";
import { UserMessageContent } from "../../../src/web/src/components/pi-web-ui/user-message-content";
import { syncToItems } from "../../../src/web/src/core/chat-conversion";
import { parseDocument } from "../../../src/web/src/core/dil/index";
import type { DilDiagnostic } from "../../../src/web/src/core/dil/types";
import { copyText } from "../../../src/web/src/core/format";
import type { ChatItem, PiMessage } from "../../../src/web/src/core/types";
import type { CaseResult, ExamplesPreviewData, PreviewData, ReportsPreviewData, Summary } from "./types";

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
  activeLine,
}: {
  readonly anchor: string;
  readonly sourceLines: readonly string[];
  readonly diagnostics: readonly DilDiagnostic[];
  readonly activeLine?: number | null;
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
        const isActive = lineNo === activeLine;
        return (
          <Fragment key={lineNo}>
            <div
              className={`src-line${hasErr ? " has-diag" : ""}${isActive ? " is-targeted" : ""}`}
              id={`${anchor}-L${lineNo}`}
              tabIndex={isActive ? -1 : undefined}
            >
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

function CopySourceButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      aria-label="Copy raw source"
      className={copied ? "copy-src-btn copied" : "copy-src-btn"}
      onClick={async () => {
        if (copied) return;
        await copyText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Icon size={14} />
    </button>
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
        <div className="src-frame">
          <div className="src-head">
            <span>source</span>
            <CopySourceButton text={source} />
          </div>
          <NumberedSource anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
        </div>
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

type TrajectoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ChatItem[] };

function parseTrajectory(source: string): ChatItem[] {
  const entries = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; id?: string; message?: PiMessage });
  let counter = 0;
  const items = syncToItems(
    entries,
    (prefix) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    [],
  );
  // Static replay: no composer to add to, so drop the assistant message actions menu.
  return items.map((item) =>
    item.kind === "message" && item.role === "assistant" ? { ...item, copyable: false } : item,
  );
}

function TrajectoryBody({
  state,
  onToggleTool,
}: {
  readonly state: TrajectoryState;
  readonly onToggleTool: (id: string, open: boolean) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "loading") return <div className="trajectory-status">loading trajectory…</div>;
  if (state.status === "error") {
    return <div className="trajectory-status trajectory-error">failed to load trajectory: {state.message}</div>;
  }

  const sections = groupTranscript(state.items, true);
  return (
    <div className="trajectory-view">
      {sections.map((section) => {
        if (section.kind === "process") {
          const first = section.rows[0];
          return (
            <ProcessGroup
              key={`process:${first.kind}:${first.id}`}
              rows={section.rows}
              active={false}
              toolExpansion={null}
            >
              {section.rows.map((item) => (
                <ChatItemView
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  onCopy={copyText}
                  onQuote={() => {}}
                  onToggleTool={onToggleTool}
                  reasoningRow={item.kind === "message"}
                  processRow
                  theme="light"
                />
              ))}
            </ProcessGroup>
          );
        }

        const { item } = section;
        if (item.kind === "message" && item.role === "user") {
          return (
            <Message key={`user:${item.id}`} from="user">
              <MessageContent className="is-user:dark ml-auto min-w-0 max-w-full rounded-lg bg-secondary px-4 py-3 text-sm text-foreground">
                <UserMessageContent>{item.text}</UserMessageContent>
              </MessageContent>
            </Message>
          );
        }
        return (
          <ChatItemView
            key={`${item.kind}:${item.id}`}
            item={item}
            onCopy={copyText}
            onQuote={() => {}}
            onToggleTool={onToggleTool}
            theme="light"
          />
        );
      })}
    </div>
  );
}

function TrajectorySection({ url }: { readonly url: string }) {
  const [state, setState] = useState<TrajectoryState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/${url}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((source) => {
        if (!cancelled) setState({ status: "ready", items: parseTrajectory(source) });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function toggleTool(id: string, nextOpen: boolean) {
    setState((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            items: prev.items.map((item) =>
              item.kind === "tool" && item.id === id ? { ...item, open: nextOpen } : item,
            ),
          }
        : prev,
    );
  }

  return <TrajectoryBody state={state} onToggleTool={toggleTool} />;
}

function CaseCard({
  anchor,
  model,
  result,
}: {
  readonly anchor: string;
  readonly model: string;
  readonly result: CaseResult;
}) {
  const parsed = useMemo(() => parseDocument(result.text), [result.text]);
  const sourceLines = useMemo(() => normalizeSource(result.text).split("\n"), [result.text]);
  const [showSource, setShowSource] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function openLinkedLine() {
      const prefix = `#${anchor}-L`;
      const hash = window.location.hash;
      if (!hash.startsWith(prefix)) return;
      const line = Number(hash.slice(prefix.length));
      if (!Number.isInteger(line) || line < 1 || line > sourceLines.length) return;
      setShowSource(true);
      setActiveLine(line);
    }

    openLinkedLine();
    window.addEventListener("hashchange", openLinkedLine);
    return () => window.removeEventListener("hashchange", openLinkedLine);
  }, [anchor, sourceLines.length]);

  useEffect(() => {
    if (!showSource || activeLine === null) return;
    const line = document.getElementById(`${anchor}-L${activeLine}`);
    line?.scrollIntoView({ block: "center" });
    line?.focus({ preventScroll: true });
  }, [activeLine, anchor, showSource]);

  const traceBits: string[] = [];
  if (result.toolCallCount !== undefined) traceBits.push(`${result.toolCallCount} tools`);
  if (result.assistantTurns !== undefined) traceBits.push(`${result.assistantTurns} turns`);

  return (
    <section
      className="case report-case"
      id={anchor}
      data-case-anchor={anchor}
      aria-labelledby={`${anchor}-title`}
      ref={cardRef}
    >
      <header className="report-case-head">
        <div className="report-case-title">
          <h3 id={`${anchor}-title`}>{result.id}</h3>
        </div>
        <span className={`report-case-score score ${result.score === 100 ? "pass" : "fail"}`}>
          {result.score}% · {result.passed}/{result.total}
          {result.unscored ? ` · ${result.unscored} unscored` : ""}
        </span>
        <div className="report-case-meta">
          <span>{model}</span>
          <span>{result.category}</span>
        </div>
        <div className="case-view-switch" role="group" aria-label="Case view">
          {(
            [
              ["Preview", false],
              ["Raw Source", true],
            ] as const
          ).map(([label, isSource]) => (
            <button
              key={label}
              type="button"
              aria-pressed={showSource === isSource}
              aria-controls={`${anchor}-${isSource ? "source" : "preview"}`}
              onClick={() => {
                if (showSource === isSource) return;
                if (window.location.hash.startsWith(`#${anchor}-L`)) {
                  window.history.replaceState(null, "", `#${anchor}`);
                }
                if (cardRef.current && cardRef.current.getBoundingClientRect().top < 0) {
                  cardRef.current.scrollIntoView();
                }
                setActiveLine(null);
                setShowSource(isSource);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="report-case-body">
        {traceBits.length > 0 ? <div className="report-case-trace trace">{traceBits.join(" · ")}</div> : null}
        <ul className="checks">
          {result.checks.map((check) => (
            <li
              key={check.id ?? check.label}
              className={check.pass === null ? undefined : check.pass ? "pass" : "fail"}
              title={check.detail}
            >
              {check.pass === null ? "–" : check.pass ? "✓" : "✗"} {check.label}
            </li>
          ))}
        </ul>
        <DiagnosticsPanel anchor={anchor} sourceLines={sourceLines} diagnostics={parsed.diagnostics} />
        <div id={`${anchor}-preview`} hidden={showSource}>
          {result.trajectoryUrl ? (
            <TrajectorySection url={result.trajectoryUrl} />
          ) : (
            <div className="render">
              <DilRenderer source={result.text} />
            </div>
          )}
        </div>
        <div id={`${anchor}-source`} className="src-frame" hidden={!showSource}>
          {showSource && (
            <>
              <div className="src-head">
                <span>{sourceLines.length} lines</span>
                <CopySourceButton text={result.text} />
              </div>
              <NumberedSource
                anchor={anchor}
                sourceLines={sourceLines}
                diagnostics={parsed.diagnostics}
                activeLine={activeLine}
              />
            </>
          )}
        </div>
      </div>
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

  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const tocLinkRefs = useRef(new Map<string, HTMLAnchorElement>());

  const visibleEntries = useMemo(() => entries.map((entry, idx) => ({ ...entry, reportIndex: idx })), [entries]);

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
      const threshold = 16;
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

    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    syncActiveFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!activeAnchor) return;
    const link = tocLinkRefs.current.get(activeAnchor);
    const toc = link?.closest("nav");
    if (!link || !toc || toc.scrollHeight <= toc.clientHeight) return;
    const bounds = toc.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.top < bounds.top) toc.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) toc.scrollTop += item.bottom - bounds.bottom;
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
        <h1>DIL eval preview</h1>
        <details className="system">
          <summary>system prompt section &lt;dil&gt;</summary>
          <pre>{data.systemPrompt}</pre>
        </details>
        {visibleEntries.map(({ model, summary, reportIndex }) => (
          <section key={reportIndex} className="model-section">
            <h2 id={`model-${reportIndex}`}>
              {model} <span className={`score ${summary.score === 100 ? "pass" : "fail"}`}>{summary.score}%</span>
            </h2>
            {summary.cases.map((result) => {
              const anchor = `case-${reportIndex}-${result.id}`;
              return <CaseCard key={anchor} anchor={anchor} model={model} result={result} />;
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
