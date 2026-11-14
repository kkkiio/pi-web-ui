import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { reasoningPreview } from "@/components/ai-elements/reasoning";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatToolInvocationTitle, formatToolSummary } from "../../core/tool-summary";
import type { ChatItem } from "../../core/types";

const MINIMUM_TITLE_MS = 150;

const TOOL_ACTIONS = new Map([
  ["read", "Reading"],
  ["bash", "Running"],
  ["grep", "Searching"],
  ["find", "Searching"],
  ["write", "Writing"],
  ["edit", "Editing"],
]);

type TranscriptSection = { kind: "process"; rows: ChatItem[] } | { kind: "standalone"; item: ChatItem };

export function groupTranscript(items: ChatItem[], showThinking: boolean): TranscriptSection[] {
  const sections: TranscriptSection[] = [];
  let process: ChatItem[] | undefined;

  for (const item of items) {
    const assistant = item.kind === "message" && item.role === "assistant";
    const reasoning = assistant && showThinking && (item.thinking || item.reasoning?.trim());
    const tool =
      item.kind === "tool" && item.name !== "webui_ask_user_question" && !/^sub[-_]?agents?$/i.test(item.name);

    if (reasoning || tool) {
      if (!process) {
        process = [];
        sections.push({ kind: "process", rows: process });
      }
      process.push(item);
    }

    if (!tool && (!assistant || item.text.trim())) {
      process = undefined;
      sections.push({ kind: "standalone", item });
    }
  }
  return sections;
}

export function ProcessGroup({
  rows,
  active,
  children,
  toolExpansion,
}: {
  rows: ChatItem[];
  active: boolean;
  children: ReactNode;
  toolExpansion: { open: boolean } | null;
}) {
  const [selection, setSelection] = useState({ command: toolExpansion, open: false });
  const tools = rows.filter((row) => row.kind === "tool");
  const failed = tools.filter((tool) => tool.state === "output-error").length;
  const runningTool = tools
    .filter((tool) => tool.state === "input-available" || tool.state === "input-streaming")
    .at(-1);
  const latest = rows.at(-1);
  const thinking = latest?.kind === "message";
  const preview = active && thinking && !runningTool ? reasoningPreview(latest.reasoning ?? "", true) : undefined;
  const open =
    (tools.length > 0 && selection.command !== toolExpansion ? toolExpansion?.open : selection.open) ?? false;

  const toolDetail = runningTool && formatToolSummary(runningTool);
  const toolAction =
    runningTool && (TOOL_ACTIONS.get(runningTool.name) ?? `Running ${formatToolInvocationTitle(runningTool.name)}`);
  const title = active
    ? runningTool
      ? [toolAction, toolDetail].filter(Boolean).join(" ")
      : thinking
        ? "Thinking…"
        : "Working…"
    : tools.length
      ? `${tools.length} tool call${tools.length === 1 ? "" : "s"}`
      : "Thinking";

  const [displayed, setDisplayed] = useState<{ title: string; preview?: string; since: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setDisplayed(null);
      return;
    }
    if (displayed?.title === title && displayed.preview === preview) return;

    const publish = () => setDisplayed({ title, preview, since: performance.now() });
    const remaining = displayed ? MINIMUM_TITLE_MS - (performance.now() - displayed.since) : 0;
    if (remaining <= 0) {
      publish();
      return;
    }

    const timer = window.setTimeout(publish, remaining);
    return () => window.clearTimeout(timer);
  }, [active, displayed, title, preview]);

  const visibleTitle = active && displayed ? displayed : { title, preview };
  return (
    <Collapsible open={open} onOpenChange={(open) => setSelection({ command: toolExpansion, open })}>
      <CollapsibleTrigger className="group/process flex max-w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-muted-foreground text-sm hover:text-foreground">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/process:rotate-90" />
        <span className="min-w-0 truncate">
          {visibleTitle.title}
          {!open && visibleTitle.preview && <span className="text-muted-foreground/80"> · {visibleTitle.preview}</span>}
        </span>
        {failed > 0 && <span className="shrink-0 text-destructive">· {failed} failed</span>}
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="ml-2 mt-1 flex flex-col gap-2 border-l pl-3 data-[state=closed]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
