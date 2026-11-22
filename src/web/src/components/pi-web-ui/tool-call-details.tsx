import { getFiletypeFromFileName, parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { FileCodeIcon, SquareTerminalIcon } from "lucide-react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bundledLanguages } from "shiki";
import { normalizeTheme, tokenizeAnsiWithTheme } from "shiki/core";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatItem } from "../../core/types";
import { ImagePreviewStrip } from "./image-preview-strip";

type ToolCall = Extract<ChatItem, { kind: "tool" }>;

const FILE_PREVIEW_LINES = 8;
const ANSI_COLORS = {
  Black: ["#302f2c", "#a6b7b8"],
  Red: ["#a4262c", "#ff8a83"],
  Green: ["#176b3a", "#85d8a2"],
  Yellow: ["#785700", "#efca72"],
  Blue: ["#185a9d", "#84bff7"],
  Magenta: ["#743286", "#daa9e8"],
  Cyan: ["#17616b", "#7dd6db"],
  White: ["#53616d", "#c4cece"],
  BrightBlack: ["#5e5b53", "#93a1a1"],
  BrightRed: ["#b82836", "#ffabaa"],
  BrightGreen: ["#217946", "#a8ebbd"],
  BrightYellow: ["#866100", "#ffe29e"],
  BrightBlue: ["#1e62ad", "#b1d6ff"],
  BrightMagenta: ["#873d99", "#edc3f6"],
  BrightCyan: ["#1d6b75", "#a7eceb"],
  BrightWhite: ["#64695f", "#f4f1e9"],
} as const;
const TERMINAL_THEMES = (["light", "dark"] as const).map((name, index) =>
  normalizeTheme({
    name,
    colors: {
      "editor.foreground": "var(--card-foreground)",
      "editor.background": "var(--card)",
      ...Object.fromEntries(
        Object.entries(ANSI_COLORS).map(([color, variants]) => [`terminal.ansi${color}`, variants[index]]),
      ),
    },
  }),
);
const COPY_BUTTON_CLASS = "size-7 shrink-0 text-current hover:bg-current/10 hover:text-current";

function BashDetails({ tool, theme }: { tool: ToolCall; theme: "light" | "dark" }) {
  const { command, timeout } = (tool.input ?? {}) as { command?: unknown; timeout?: unknown };
  const { truncation } = (tool.outputDetails ?? {}) as { truncation?: { truncated?: boolean } };
  const running = tool.state === "input-streaming" || tool.state === "input-available";
  const failed = tool.state === "output-error";
  const result = tool.errorText ?? (typeof tool.output === "string" ? tool.output : "");
  const output = (
    !failed || tool.exitCode === undefined
      ? result
      : result.replace(new RegExp(`\\n\\nCommand exited with code ${tool.exitCode}$`), "")
  ).replace(/\r\n/g, "\n");
  const lines = useMemo(() => {
    let offset = 0;
    return tokenizeAnsiWithTheme(TERMINAL_THEMES[theme === "dark" ? 1 : 0], output).map((tokens) => {
      const key = offset;
      const spans = tokens.map((token) => {
        const span = { ...token, key: offset };
        offset += token.content.length;
        return span;
      });
      offset += 1;
      return { key, spans };
    });
  }, [output, theme]);
  const outputRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (output && following.current && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const hasOutput = Boolean(output);
  const duration = tool.durationMs !== undefined ? `${(tool.durationMs / 1000).toFixed(1)}s` : undefined;
  const status = failed ? "Failed" : running ? "Running" : "Completed";
  return (
    <section
      aria-label="Bash command"
      className="min-w-0 overflow-hidden rounded-md border bg-card text-card-foreground"
    >
      <div className="flex min-w-0 items-start gap-2 border-b bg-muted/40 px-2.5 py-2">
        <SquareTerminalIcon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-xs">
          {typeof command === "string" ? command : ""}
        </pre>
        {typeof command === "string" && (
          <CodeBlockCopyButton
            aria-label="Copy command"
            className={COPY_BUTTON_CLASS}
            text={command}
            title="Copy command"
          />
        )}
      </div>
      <div className="flex min-h-9 items-center gap-2 px-3 text-xs">
        <span
          className={cn(
            "font-medium",
            failed ? "text-destructive" : running ? "text-primary" : "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {status}
        </span>
        {duration && <span className="text-muted-foreground">{duration}</span>}
        {typeof timeout === "number" && <span className="text-muted-foreground">Timeout {timeout}s</span>}
        {truncation?.truncated && <span className="text-amber-800 dark:text-amber-300">Output truncated</span>}
        {hasOutput && (
          <CodeBlockCopyButton
            aria-label="Copy output"
            className={cn(COPY_BUTTON_CLASS, "ml-auto")}
            text={lines.map(({ spans }) => spans.map(({ content }) => content).join("")).join("\n")}
            title="Copy output"
          />
        )}
      </div>
      {hasOutput ? (
        <div
          ref={outputRef}
          className="max-h-64 overflow-auto border-t"
          data-quote-source="bash output"
          onScroll={(event) => {
            const { scrollHeight, clientHeight, scrollTop } = event.currentTarget;
            following.current = scrollHeight - clientHeight - scrollTop <= 16;
          }}
        >
          <pre className="min-w-max px-3 py-2 font-mono text-xs leading-5">
            <code>
              {lines.map(({ key, spans }) => (
                <Fragment key={key}>
                  {key > 0 && "\n"}
                  {spans.map(({ key: spanKey, content, color, bgColor }) => (
                    <span key={spanKey} style={{ color, backgroundColor: bgColor }}>
                      {content}
                    </span>
                  ))}
                </Fragment>
              ))}
            </code>
          </pre>
        </div>
      ) : (
        !running && <p className="border-t px-3 py-2 text-muted-foreground text-xs">No output</p>
      )}
    </section>
  );
}

function FilePreview({
  path,
  content,
  startLine,
  source,
}: {
  path: string;
  content: string;
  startLine: number;
  source: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(() => content.replace(/\r\n/g, "\n").split("\n"), [content]);
  const lineCount = lines.length - Number(lines.length > 1 && lines.at(-1) === "");
  const language = getFiletypeFromFileName(path);
  const hasMore = lineCount > FILE_PREVIEW_LINES;
  const visible = expanded ? lines.slice(0, lineCount) : lines.slice(0, Math.min(lineCount, FILE_PREVIEW_LINES));
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2.5 py-1.5 text-muted-foreground text-xs">
        <FileCodeIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono" title={path}>
          {path}
        </span>
        <CodeBlockCopyButton
          aria-label="Copy file content"
          className={COPY_BUTTON_CLASS}
          text={content}
          title="Copy file content"
        />
      </div>
      {content ? (
        <CodeBlock
          className="rounded-none border-0 [&_pre]:p-2 [&_pre]:text-xs [&_pre_code]:text-xs"
          code={visible.join("\n")}
          data-quote-source={source}
          language={Object.hasOwn(bundledLanguages, language) ? (language as keyof typeof bundledLanguages) : "text"}
          showLineNumbers
          startLine={startLine}
          viewportClassName="max-h-72"
        />
      ) : (
        <p className="px-3 py-2 text-muted-foreground text-xs">Empty file</p>
      )}
      {hasMore && (
        <div className="border-t bg-muted/25 px-2 py-1">
          <Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)} size="xs" variant="ghost">
            {expanded ? "Show less" : `Show ${lineCount - FILE_PREVIEW_LINES} more lines`}
          </Button>
        </div>
      )}
    </div>
  );
}

function EditDetails({ tool, theme }: { tool: ToolCall; theme: "light" | "dark" }) {
  const { diff, patch } = (tool.outputDetails ?? {}) as { diff?: unknown; patch?: unknown };
  const files = useMemo(() => {
    if (typeof patch !== "string" || tool.state !== "output-available") return [];
    try {
      return parsePatchFiles(patch, { throwOnError: true }).flatMap((part) =>
        part.files.filter((file) => file.hunks.length > 0),
      );
    } catch {
      return [];
    }
  }, [patch, tool.state]);

  if (files.length === 0) {
    if (tool.state === "input-streaming" || tool.state === "input-available") return <ToolInput input={tool.input} />;
    if (tool.state === "output-available" && typeof diff === "string" && diff) {
      return (
        <CodeBlock
          className="[&_pre]:p-2 [&_pre_code]:text-xs"
          code={diff}
          data-quote-source="edit diff"
          language="diff"
          viewportClassName="max-h-80"
        />
      );
    }
    return <ToolOutput data-quote-source="edit output" errorText={tool.errorText} output={tool.output} />;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-md border" data-quote-source="edit diff">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2.5 py-1.5 text-muted-foreground text-xs">
        <span className="min-w-0 flex-1 truncate font-mono" title={files[0].name}>
          {files[0].name}
        </span>
        <CodeBlockCopyButton
          aria-label="Copy patch"
          className={COPY_BUTTON_CLASS}
          text={patch as string}
          title="Copy patch"
        />
      </div>
      <div className="max-h-80 overflow-auto">
        {files.map((file) => (
          <FileDiff
            key={file.name}
            fileDiff={file}
            options={{
              diffStyle: "unified",
              diffIndicators: "classic",
              disableFileHeader: files.length === 1,
              hunkSeparators: "line-info-basic",
              overflow: "scroll",
              themeType: theme,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ToolCallDetails({ tool, theme }: { tool: ToolCall; theme: "light" | "dark" }) {
  if (tool.name === "bash" && typeof (tool.input as { command?: unknown } | null)?.command === "string") {
    return <BashDetails theme={theme} tool={tool} />;
  }
  if (tool.name === "edit") return <EditDetails theme={theme} tool={tool} />;

  const { path, content, offset, limit } = (tool.input ?? {}) as {
    path?: unknown;
    content?: unknown;
    offset?: number;
    limit?: number;
  };
  if (
    tool.name === "write" &&
    typeof path === "string" &&
    typeof content === "string" &&
    tool.state !== "output-error"
  ) {
    return <FilePreview content={content} path={path} source="write input" startLine={1} />;
  }
  if (
    tool.name === "read" &&
    typeof path === "string" &&
    typeof tool.output === "string" &&
    !tool.outputImages?.length
  ) {
    const { truncation } = (tool.outputDetails ?? {}) as {
      truncation?: { content?: string; firstLineExceedsLimit?: boolean };
    };
    const clipped = typeof truncation?.content === "string" ? truncation.content : undefined;
    const continued = limit && /\n\n\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/.exec(tool.output);
    const text = clipped ?? (continued ? tool.output.slice(0, continued.index) : tool.output);
    const notice = truncation?.firstLineExceedsLimit ? tool.output : tool.output.slice(text.length).trim();
    return (
      <>
        {!truncation?.firstLineExceedsLimit && (
          <FilePreview content={text} path={path} source="read output" startLine={offset && offset > 0 ? offset : 1} />
        )}
        {notice && (
          <p className="break-words text-muted-foreground text-xs" data-quote-source="read output">
            {notice}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {tool.name !== "read" && tool.name !== "write" && <ToolInput input={tool.input} />}
      <ToolOutput data-quote-source={`${tool.name} output`} errorText={tool.errorText} output={tool.output} />
      <ImagePreviewStrip images={tool.outputImages} readonly />
    </>
  );
}
