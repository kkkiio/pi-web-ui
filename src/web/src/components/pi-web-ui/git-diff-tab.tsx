import { type FileDiffMetadata, parsePatchFiles, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  Columns2Icon,
  CopyIcon,
  FilesIcon,
  FolderIcon,
  ListIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  WrapTextIcon,
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

type ReviewEntry = GitChangedFile & { id: string };
type ReviewDirectory = { path: string; files: ReviewEntry[]; children: Map<string, ReviewDirectory> };

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
  const [expandedFiles, setExpandedFiles] = useState<Set<string> | null>(null);
  const [layout, setLayout] = useState<"unified" | "split">("unified");
  const [wrapLines, setWrapLines] = useState(true);
  const [copyError, setCopyError] = useState("");
  const send = usePiWebUiStore((state) => state.send);
  const files = useMemo(() => {
    const trackedPaths = new Set(tab.files?.filter((entry) => !entry.untracked).map((entry) => entry.path));
    return (
      tab.files?.map((entry) => ({
        ...entry,
        id: entry.untracked && trackedPaths.has(entry.path) ? `/${entry.path}` : entry.path,
      })) ?? []
    );
  }, [tab.files]);
  const tree = useMemo(() => {
    const root: ReviewDirectory = { path: "", files: [], children: new Map() };
    for (const file of files) {
      const segments = file.path.split("/");
      segments.pop();
      let directory = root;
      for (const segment of segments) {
        let child = directory.children.get(segment);
        if (!child) {
          child = { path: `${directory.path}${segment}/`, files: [], children: new Map() };
          directory.children.set(segment, child);
        }
        directory = child;
      }
      directory.files.push(file);
    }
    return root;
  }, [files]);
  const expanded = expandedFiles ?? new Set(files.length === 1 ? [files[0].id] : []);

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
  if (!files.length) return <PanelMessage title="No changes" body="The working tree has no changes to review." />;

  return (
    <section className="@container flex h-full min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
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
            aria-label="Wrap lines"
            aria-pressed={wrapLines}
            onClick={() => setWrapLines((current) => !current)}
            size="icon-sm"
            title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}
            type="button"
            variant={wrapLines ? "secondary" : "ghost"}
          >
            <WrapTextIcon className="size-4" />
          </Button>
          <Button
            aria-label="Collapse all files"
            disabled={!expanded.size}
            onClick={() => setExpandedFiles(new Set())}
            size="icon-sm"
            title="Collapse all files"
            type="button"
            variant="ghost"
          >
            <ChevronsDownUpIcon className="size-4" />
          </Button>
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
      <div className="git-review-scroll min-h-0 flex-1 overflow-auto overscroll-contain bg-card">
        <ChangedFiles
          directory={tree}
          expanded={expanded}
          layout={layout}
          wrapLines={wrapLines}
          theme={theme}
          onQuote={onQuote}
          onRefresh={onRetry}
          onToggle={(id) => {
            setExpandedFiles((current) => {
              const next = new Set(current ?? expanded);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
        />
      </div>
    </section>
  );
}

function ChangedFiles({
  directory,
  expanded,
  layout,
  wrapLines,
  theme,
  onQuote,
  onToggle,
  onRefresh,
  depth = 0,
}: {
  directory: ReviewDirectory;
  expanded: Set<string>;
  layout: "unified" | "split";
  wrapLines: boolean;
  theme: "light" | "dark";
  onQuote: (quote: TranscriptQuote) => void;
  onToggle: (id: string) => void;
  onRefresh: () => void;
  depth?: number;
}) {
  const childFiles: ReviewEntry[] = [];
  const groups: ReviewDirectory[] = [];
  for (const child of directory.children.values()) {
    let group = child;
    while (!group.files.length && group.children.size === 1) {
      const next = group.children.values().next().value;
      if (!next) break;
      group = next;
    }
    if (group.files.length === 1 && group.children.size === 0) childFiles.push(group.files[0]);
    else groups.push(group);
  }

  return (
    <ul aria-label={depth > 0 ? undefined : "Changed files"}>
      {[...directory.files, ...childFiles].map((file) => {
        const open = expanded.has(file.id);
        const nameIndex = file.path.lastIndexOf("/") + 1;
        const name = file.path.slice(nameIndex);
        const folder = file.path.slice(0, nameIndex).slice(directory.path.length);
        const status =
          { A: "Added", D: "Deleted", R: "Renamed", M: "Modified", T: "Type changed", U: "Unmerged", C: "Copied" }[
            file.status
          ] ?? "Changed";
        return (
          <li className="min-w-0" key={file.id}>
            <button
              aria-expanded={open}
              className={cn(
                "flex min-h-9 w-full min-w-0 items-center gap-2 px-3 text-left hover:bg-muted/70",
                open && "bg-muted/55",
              )}
              onClick={() => onToggle(file.id)}
              title={file.path}
              type="button"
            >
              {open ? (
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[13px]">
                <span className="max-w-full shrink-0 truncate font-medium">{name}</span>
                {folder && <span className="min-w-0 truncate text-muted-foreground">{folder}</span>}
                {file.id !== file.path && <span className="text-muted-foreground">(untracked)</span>}
              </span>
              <span className="flex shrink-0 gap-1.5 font-mono text-xs tabular-nums">
                {file.additions > 0 && (
                  <span className="text-emerald-700 dark:text-emerald-400">+{file.additions}</span>
                )}
                {file.deletions > 0 && <span className="text-destructive">−{file.deletions}</span>}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-[4px] border border-current/25 font-medium text-[10px] text-muted-foreground",
                  file.status === "A" && "text-emerald-700 dark:text-emerald-400",
                  file.status === "D" && "text-destructive",
                  file.status === "M" && "text-amber-700 dark:text-amber-400",
                )}
                title={status}
              >
                {file.status}
              </span>
              <span className="sr-only">{status}</span>
            </button>
            {open && (
              <div style={{ marginInlineStart: -20 * depth }}>
                <ReviewFileDiff
                  file={file}
                  layout={layout}
                  wrapLines={wrapLines}
                  theme={theme}
                  onQuote={onQuote}
                  onRefresh={onRefresh}
                />
              </div>
            )}
          </li>
        );
      })}
      {groups.map((group) => (
        <li className="min-w-0" key={group.path}>
          <details open>
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-muted-foreground text-xs hover:bg-muted/50">
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate" title={group.path}>
                {group.path.slice(directory.path.length)}
              </span>
            </summary>
            <div className="ml-[19px] border-l">
              <ChangedFiles
                directory={group}
                expanded={expanded}
                layout={layout}
                wrapLines={wrapLines}
                theme={theme}
                onQuote={onQuote}
                onToggle={onToggle}
                onRefresh={onRefresh}
                depth={depth + 1}
              />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function ReviewFileDiff({
  file,
  layout,
  wrapLines,
  theme,
  onQuote,
  onRefresh,
}: {
  file: GitChangedFile;
  layout: "unified" | "split";
  wrapLines: boolean;
  theme: "light" | "dark";
  onQuote: (quote: TranscriptQuote) => void;
  onRefresh: () => void;
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
      const patch = files.find((entry) => entry.name === path);
      return { file: patch, error: state.result?.diff && !patch ? "The patch did not contain this file." : null };
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
  if (state.result.omitted) return <PanelMessage title={path} body={state.result.omitted} />;
  if (!parsed.file) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-muted-foreground text-xs">The changes list is out of date.</p>
        <Button onClick={onRefresh} size="sm" type="button" variant="outline">
          Refresh Changes
        </Button>
      </div>
    );
  }
  return <ReviewFile file={parsed.file} layout={layout} wrapLines={wrapLines} theme={theme} onQuote={onQuote} />;
}

function ReviewFile({
  file,
  layout,
  wrapLines,
  theme,
  onQuote,
}: {
  file: FileDiffMetadata;
  layout: "unified" | "split";
  wrapLines: boolean;
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
      className="git-review-diff border-b"
      options={{
        diffStyle: layout,
        diffIndicators: "bars",
        disableFileHeader: true,
        hunkSeparators: "line-info-basic",
        themeType: theme,
        overflow: wrapLines ? "wrap" : "scroll",
        enableLineSelection: true,
        enableGutterUtility: true,
        unsafeCSS: `
          [data-gutter-buffer="annotation"] { background: var(--card); }
          [data-gutter-utility-slot] { z-index: 2; align-items: center; inset-inline: 100% auto; transform: translateX(-2px); }
          [data-gutter-utility-slot] ::slotted(*) { pointer-events: none; }
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
          className="pointer-events-auto flex size-4 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm"
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
