import { CopyIcon, EllipsisIcon, QuoteIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useMemo } from "react";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { historicalQuestion } from "../../core/ask-user-question";
import { usePiWebUiStore } from "../../core/store";
import { formatToolSummary, isToolExpandable } from "../../core/tool-summary";
import type { ChatItem } from "../../core/types";
import { type DilHost, DilHostContext, DilRenderer } from "../dil";

import { ToolCallDetails } from "./tool-call-details";
import type { TranscriptQuote } from "./transcript-quote";

export function ChatItemView({
  item: transcriptItem,
  onCopy,
  onQuote,
  onToggleTool,
  reasoningRow = false,
  processRow = false,
  theme,
}: {
  item: ChatItem;
  onCopy: (text: string) => Promise<void> | void;
  onQuote: (quote: TranscriptQuote) => void;
  onToggleTool: (id: string, open: boolean) => void;
  reasoningRow?: boolean;
  processRow?: boolean;
  theme: "light" | "dark";
}) {
  const item = usePiWebUiStore((state) =>
    transcriptItem.kind === "message" && transcriptItem.streaming && state.streamingMessage?.id === transcriptItem.id
      ? state.streamingMessage
      : transcriptItem,
  );
  const questionnaire = usePiWebUiStore((state) => state.questionnaires[item.id]);

  // The browser half of DIL's `GenUI` (`#48`): a card's button sends a turn directly. The
  // composer is not involved — no draft, no prefill — and `busy` disables every card
  // action while Pi is working.
  const chatStatus = usePiWebUiStore((state) => state.chatStatus);
  const connection = usePiWebUiStore((state) => state.connection);
  const loadingTreeEntryId = usePiWebUiStore((state) => state.loadingTreeEntryId);
  const sendPrompt = usePiWebUiStore((state) => state.sendPrompt);
  const dilHost = useMemo<DilHost>(
    () => ({
      issueNewTurn: async (prompt) => {
        await sendPrompt({ message: prompt });
      },
      // `error` is not busy: a rejection leaves `chatStatus` there, and `sendPrompt` allows a
      // retry from it — so a failed card submission must stay clickable. Only the two
      // in-flight states block, plus a Save & Send rewind (`loadingTreeEntryId`, the same
      // condition that blocks the composer while the session tree moves).
      busy:
        chatStatus === "submitted" ||
        chatStatus === "streaming" ||
        connection !== "connected" ||
        loadingTreeEntryId !== null,
    }),
    [sendPrompt, chatStatus, connection, loadingTreeEntryId],
  );
  if (item.kind === "system") {
    return (
      <div
        className={cn(
          "mx-auto max-w-xl whitespace-pre-wrap rounded-md border px-3 py-2 text-center text-sm",
          item.tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
          item.tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          (!item.tone || item.tone === "info") && "bg-muted text-muted-foreground",
        )}
      >
        {item.text}
      </div>
    );
  }

  if (item.kind === "tool") {
    if (item.name === "webui_ask_user_question" && !processRow) {
      if (questionnaire?.status === "pending") return null;
      const question = historicalQuestion(item);
      if (!question) return null;
      const details = item.outputDetails as
        | {
            answers?: { questionIndex: number; kind: string; answer: string | null; selected?: string[] }[];
          }
        | undefined;
      return (
        <section
          aria-label="Questions and answers"
          className="space-y-2 rounded-lg border px-3 py-2 text-sm"
          data-quote-source="Question answers"
          data-testid="ask-user-question-history"
        >
          <div className="text-muted-foreground text-xs">
            {question.status === "cancelled" ? "Cancelled" : "Answered"}
          </div>
          {question.status === "answered" &&
            (details?.answers ? (
              <dl className="space-y-2">
                {details.answers.map((answer) => (
                  <div key={answer.questionIndex}>
                    <dt className="break-words text-muted-foreground">
                      {question.questions[answer.questionIndex]?.question}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {answer.kind === "skipped"
                        ? "Skipped"
                        : [...(answer.selected ?? []), answer.answer].filter(Boolean).join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="whitespace-pre-wrap break-words">{String(item.output ?? "")}</div>
            ))}
        </section>
      );
    }
    const expandable = isToolExpandable(item);
    const open = expandable ? (item.open ?? false) : false;

    return (
      <div className="w-full max-w-[95%]">
        <Tool onOpenChange={(nextOpen) => expandable && onToggleTool(item.id, nextOpen)} open={open}>
          <ToolHeader
            collapsible={expandable}
            state={item.state}
            summary={item.name === "webui_ask_user_question" ? undefined : formatToolSummary(item)}
            title={item.name === "webui_ask_user_question" ? "Ask question" : item.name}
            trailing={
              item.name === "bash" && item.exitCode !== undefined ? (
                <span className={cn("font-mono text-xs", item.exitCode !== 0 && "text-destructive")}>
                  Exit {item.exitCode}
                </span>
              ) : undefined
            }
            type={`tool-${item.name}` as `tool-${string}`}
          />
          {expandable && (
            <ToolContent>
              <ToolCallDetails theme={theme} tool={item} />
            </ToolContent>
          )}
        </Tool>
      </div>
    );
  }

  if (reasoningRow) {
    return (
      <Reasoning className="mb-0" isStreaming={Boolean(item.thinking)}>
        <ReasoningTrigger reasoning={item.reasoning} />
        <ReasoningContent data-quote-source="Assistant reasoning">{item.reasoning ?? ""}</ReasoningContent>
      </Reasoning>
    );
  }

  // item.kind === "message" and role is "assistant" (user messages handled by UserMessageView)
  const canCopy = item.text.trim().length > 0 && item.copyable !== false && !item.streaming;

  return (
    <Message
      className={cn(
        canCopy && "relative rounded-lg has-[>[data-slot=dropdown-menu-trigger][data-state=open]]:bg-muted/50",
      )}
      from={item.role}
    >
      {canCopy && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Message actions"
              className="absolute -top-3 right-0 z-10 size-7 rounded-full bg-background shadow-xs transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              size="icon"
              variant="outline"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44 rounded-lg">
            <DropdownMenuItem onSelect={() => onQuote({ id: nanoid(), source: "Assistant", text: item.text })}>
              <QuoteIcon />
              Add to Chat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void onCopy(item.text)}>
              <CopyIcon />
              Copy as Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <MessageContent className={cn("w-full", item.streaming && 'after:ml-1 after:animate-pulse after:content-["▋"]')}>
        <div data-quote-source="Assistant">
          <DilHostContext.Provider value={dilHost}>
            <DilRenderer isStreaming={Boolean(item.streaming)} source={item.text} />
          </DilHostContext.Provider>
        </div>
      </MessageContent>
    </Message>
  );
}
