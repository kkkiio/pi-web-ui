import { type FileDiffMetadata, parsePatchFiles, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  Columns2Icon,
  CopyIcon,
  FileCodeIcon,
  FilesIcon,
  ListIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copyText } from "../../core/format";
import { usePiWebUiStore } from "../../core/store";
import type { GitChangedFile, GitDiffResult, RightPanelTab } from "../../core/types";
import type { TranscriptQuote } from "./transcript-quote";
import "./git-diff-tab.css";

export default function GitDiffTab({
  tab,
  theme,
  onQuote,
  onRetry,
}: {
  tab: RightPanelTab;
  theme: "light" | "dark";
  onQuote: (quote: TranscriptQuote) => void;
  onRetry: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [layout, setLayout] = useState<"unified" | "split">("unified");
  const [copyError, setCopyError] = useState("");
  const send = usePiWebUiStore((state) => state.send);
  const trackedPaths = new Set(tab.files?.filter((entry) => !entry.untracked).map((entry) => entry.path));
  const files =
    tab.files?.map((entry) => ({
      ...entry,
      id: entry.untracked && trackedPaths.has(entry.path) ? `/${entry.path}` : entry.path,
    })) ?? [];
  const file = files.find(({ id }) => id === selectedId) ?? files[0];

  if (tab.loading) return <LoadingPanel label="Loading changes" />;
  const error = tab.error;
  if (error) {
    return (
      <div className="space-y-3 p-3">
        <PanelMessage tone="error" title="Unable to load changes" body={error} />
        <Button onClick={onRetry} size="sm" variant="outline">
          Try again
        </Button>
      </div>
    );
  }
  if (!tab.isRepo) return <PanelMessage title="No git repository" body="Open a git workspace to view changes." />;
  if (!file) return <PanelMessage title="No changes" body="The working tree has no changes to review." />;

  return (
    <section className="@container flex h-full min-w-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
          <FilesIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            {files.length} {files.length === 1 ? "changed file" : "changed files"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div aria-label="Diff layout" className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5" role="group">
            {(
              [
                { mode: "unified", label: "Unified", Icon: ListIcon },
                { mode: "split", label: "Split", Icon: Columns2Icon },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <button
                aria-label={label}
                aria-pressed={layout === mode}
                className={cn(
                  "grid size-7 place-items-center rounded-sm text-muted-foreground hover:text-foreground",
                  layout === mode && "bg-card text-foreground shadow-xs",
                )}
                key={mode}
                onClick={() => setLayout(mode)}
                title={label}
                type="button"
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <Button
            aria-label="Copy diff"
            onClick={async () => {
              setCopyError("");
              try {
                const result = (await send("get_git_diff")) as GitDiffResult;
                await copyText(result.diff);
              } catch (error) {
                setCopyError(error instanceof Error ? error.message : "Unable to copy the Git diff.");
              }
            }}
            size="icon-sm"
            type="button"
            title="Copy diff"
            variant="ghost"
          >
            <CopyIcon className="size-4" />
          </Button>
        </div>
      </div>
      {copyError && (
        <p role="alert" className="border-b px-3 py-2 text-destructive text-xs">
          {copyError}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @[620px]:grid-cols-[minmax(160px,30%)_minmax(0,1fr)] @[620px]:grid-rows-1">
        <ul
          aria-label="Changed files"
          className="max-h-40 overflow-auto border-b px-1.5 py-1.5 @[620px]:max-h-none @[620px]:border-r @[620px]:border-b-0"
        >
          {files.map((entry) => (
            <li key={entry.id}>
              <button
                aria-current={file.id === entry.id ? "true" : undefined}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted/70",
                  file.id === entry.id && "bg-muted font-medium",
                )}
                onClick={() => setSelectedId(entry.id)}
                title={entry.path}
                type="button"
              >
                <FileCodeIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {entry.path}
                  {entry.id !== entry.path ? " (untracked)" : ""}
                </span>
                <span className="flex shrink-0 gap-1.5 font-mono tabular-nums">
                  <span className="text-emerald-700 dark:text-emerald-400">+{entry.additions}</span>
                  <span className="text-destructive">−{entry.deletions}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 overflow-auto bg-card">
          <div className="hidden truncate border-b px-4 py-2 font-medium text-xs @[620px]:block" title={file.path}>
            {file.path}
          </div>
          <ReviewFileDiff key={file.id} file={file} layout={layout} theme={theme} onQuote={onQuote} />
        </div>
      </div>
    </section>
  );
}

function ReviewFileDiff({
  file,
  layout,
  theme,
  onQuote,
}: {
  file: GitChangedFile;
  layout: "unified" | "split";
  theme: "light" | "dark";
  onQuote: (quote: TranscriptQuote) => void;
}) {
  const send = usePiWebUiStore((state) => state.send);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ result?: GitDiffResult; error?: string }>({});
  const { path, previousPath, untracked } = file;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry requests the same file again.
  useEffect(() => {
    let active = true;
    void send("get_git_diff", {
      paths: previousPath ? [path, previousPath] : [path],
      source: untracked ? "untracked" : "tracked",
    }).then(
      (result) => {
        if (active) setState({ result: result as GitDiffResult });
      },
      (error: unknown) => {
        if (active) setState({ error: error instanceof Error ? error.message : "The file could not be loaded." });
      },
    );
    return () => {
      active = false;
    };
  }, [path, previousPath, retry, send, untracked]);

  const parsed = useMemo(() => {
    try {
      const files = parsePatchFiles(state.result?.diff || "", { throwOnError: true }).flatMap((patch) => patch.files);
      return { file: files.find((entry) => entry.name === path), error: null };
    } catch {
      return { file: undefined, error: "The Git patch could not be read." };
    }
  }, [path, state.result]);
  const error = state.error || parsed.error;
  if (error) {
    return (
      <div className="space-y-3 p-3">
        <PanelMessage tone="error" title="Unable to load file" body={error} />
        <Button
          onClick={() => {
            setState({});
            setRetry((current) => current + 1);
          }}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!state.result) return <LoadingPanel label="Loading diff" />;
  if (!parsed.file) return <PanelMessage title={path} body={state.result.omitted || "No changes to display."} />;
  return <ReviewFile file={parsed.file} layout={layout} theme={theme} onQuote={onQuote} />;
}

function ReviewFile({
  file,
  layout,
  theme,
  onQuote,
}: {
  file: FileDiffMetadata;
  layout: "unified" | "split";
  theme: "light" | "dark";
  onQuote: (quote: TranscriptQuote) => void;
}) {
  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [comment, setComment] = useState("");
  const commentId = useId();
  const side = selection?.endSide ?? selection?.side ?? "additions";
  const lineNumber = selection?.end ?? 0;

  if (!file.hunks.length) {
    return (
      <PanelMessage
        title={file.name}
        body={file.prevName ? `Renamed from ${file.prevName}` : "No text changes to display."}
      />
    );
  }

  return (
    <FileDiff
      fileDiff={file}
      className="git-review-diff"
      options={{
        diffStyle: layout,
        diffIndicators: "classic",
        disableFileHeader: true,
        hunkSeparators: "line-info-basic",
        themeType: theme,
        overflow: "wrap",
        enableLineSelection: true,
        enableGutterUtility: true,
        unsafeCSS: `
          [data-gutter-buffer="annotation"] { background: var(--card); }
          [data-gutter-utility-slot] { z-index: 2; align-items: center; }
          [data-gutter-utility-slot] ::slotted(*) { pointer-events: auto; }
        `,
        onLineSelectionEnd: (range) => {
          if (range && (!range.endSide || range.side === range.endSide)) setSelection(range);
        },
      }}
      selectedLines={selection}
      lineAnnotations={selection ? [{ side, lineNumber }] : []}
      renderGutterUtility={(getHoveredLine) => (
        <button
          aria-label="Comment"
          className="flex size-[18px] items-center justify-center rounded bg-primary text-primary-foreground shadow-sm"
          onClick={() => {
            const line = getHoveredLine();
            if (line) setSelection({ side: line.side, start: line.lineNumber, end: line.lineNumber });
          }}
          title="Comment"
          type="button"
        >
          <MessageSquarePlusIcon className="size-3" />
        </button>
      )}
      renderAnnotation={() => {
        if (!selection) return null;
        const start = Math.min(selection.start, selection.end);
        const end = Math.max(selection.start, selection.end);
        const range = start === end ? String(start) : `${start}–${end}`;
        const old = side === "deletions";
        const source = `${old ? file.prevName || file.name : file.name} (${old ? "old" : "new"} ${start === end ? "line" : "lines"} ${range})`;
        return (
          <form
            className="space-y-2 border-y bg-card p-3 font-sans text-foreground"
            onSubmit={(event) => {
              event.preventDefault();
              const feedback = comment.trim();
              if (!feedback) return;
              const content = old ? file.deletionLines : file.additionLines;
              const lines = file.hunks.flatMap((hunk) => {
                let number = old ? hunk.deletionStart : hunk.additionStart;
                return hunk.hunkContent.flatMap((block) => {
                  const index = old ? block.deletionLineIndex : block.additionLineIndex;
                  const count = block.type === "context" ? block.lines : old ? block.deletions : block.additions;
                  const prefix = block.type === "context" ? " " : old ? "-" : "+";
                  const from = Math.max(0, start - number);
                  const to = Math.min(count, end - number + 1);
                  number += count;
                  if (from >= to) return [];
                  return content.slice(index + from, index + to).map((line) => prefix + line.replace(/\r?\n$/, ""));
                });
              });
              onQuote({ id: nanoid(), source, text: lines.join("\n"), comment: feedback });
              setComment("");
              setSelection(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setComment("");
              setSelection(null);
            }}
          >
            <label className="block text-xs" htmlFor={commentId}>
              Comment on {old ? "old" : "new"} {start === end ? "line" : "lines"} {range}
              <Textarea
                className="mt-1 min-h-16 resize-y bg-background text-sm"
                id={commentId}
                onChange={(event) => setComment(event.currentTarget.value)}
                value={comment}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setComment("");
                  setSelection(null);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button disabled={!comment.trim()} size="sm" type="submit">
                Add to Chat
              </Button>
            </div>
          </form>
        );
      }}
    />
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function PanelMessage({ body, title, tone = "muted" }: { body: string; title: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-3 text-sm",
        tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted/30",
      )}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-muted-foreground">{body}</div>
    </div>
  );
}
