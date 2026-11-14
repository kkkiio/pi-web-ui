import { CopyIcon, EllipsisIcon, QuoteIcon } from "lucide-react";
import { nanoid } from "nanoid";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
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
import { AskUserQuestionCard } from "./ask-user-question-card";

import type { TranscriptQuote } from "./transcript-quote";

export function ChatItemView({
  item,
  onCopy,
  onQuote,
  onToggleTool,
  reasoningRow = false,
}: {
  item: ChatItem;
  onCopy: (text: string) => Promise<void> | void;
  onQuote: (quote: TranscriptQuote) => void;
  onToggleTool: (id: string, open: boolean) => void;
  reasoningRow?: boolean;
}) {
  const questionnaire = usePiWebUiStore((state) => state.questionnaires[item.id]);
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
    const question = questionnaire ?? historicalQuestion(item);
    if (question) return <AskUserQuestionCard key={item.id} questionnaire={question} />;
    const expandable = isToolExpandable(item);
    const open = expandable ? (item.open ?? false) : false;

    return (
      <div className="w-full max-w-[95%]">
        <Tool onOpenChange={(nextOpen) => expandable && onToggleTool(item.id, nextOpen)} open={open}>
          <ToolHeader
            collapsible={expandable}
            state={item.state}
            summary={formatToolSummary(item)}
            title={item.name}
            type={`tool-${item.name}` as `tool-${string}`}
          />
          {expandable && (
            <ToolContent>
              <ToolInput input={item.input as never} />
              <ToolOutput
                data-quote-source={`${item.name} output`}
                errorText={item.errorText}
                output={item.output as never}
              />
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
          <MessageResponse>{item.text}</MessageResponse>
        </div>
      </MessageContent>
    </Message>
  );
}
