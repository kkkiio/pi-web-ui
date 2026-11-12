import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import type { ChatSubmitStatus } from "../../core/types";
import { ComposerStats } from "./composer-stats";
import { PromptAttachmentButton, PromptAttachmentPreview } from "./prompt-attachments";
import { type TranscriptQuote, TranscriptQuotePreview } from "./transcript-quote";

type ChatInputProps = {
  quotes: TranscriptQuote[];
  onRemoveQuote: (id: string) => void;
  viewingHistory: boolean;
  disabled?: boolean;
  chatStatus: ChatSubmitStatus;
  value: string;
  onSubmit: (opts: { text: string; files?: unknown[] }) => void;
  onAbort: () => void;
  onValueChange: (value: string) => void;
};

export function ChatInput({
  quotes,
  onRemoveQuote,
  viewingHistory,
  disabled,
  chatStatus,
  value,
  onSubmit,
  onAbort,
  onValueChange,
}: ChatInputProps) {
  if (viewingHistory) {
    return (
      <footer className="shrink-0 border-t bg-background/95 px-4 py-3">
        <div className="mx-auto w-full max-w-3xl text-center text-muted-foreground text-sm py-4">Viewing history</div>
      </footer>
    );
  }

  return (
    <footer className="shrink-0 border-t bg-background/95 px-4 py-3">
      <div className="mx-auto w-full max-w-3xl">
        <PromptInput
          accept="image/*"
          className="rounded-xl border bg-card shadow-sm"
          globalDrop={true}
          multiple
          onSubmit={onSubmit}
        >
          <TranscriptQuotePreview quotes={quotes} onRemove={onRemoveQuote} />
          <PromptAttachmentPreview />
          <PromptInputBody>
            <PromptInputTextarea
              disabled={disabled}
              className="min-h-20 resize-none"
              onChange={(event) => onValueChange(event.currentTarget.value)}
              placeholder="Message Pi..."
              value={value}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptAttachmentButton />
              <div className="hidden items-center gap-1 px-2 text-muted-foreground text-xs sm:flex">
                Enter sends, Shift+Enter inserts a newline
              </div>
            </PromptInputTools>
            <PromptInputSubmit disabled={disabled} onStop={onAbort} status={chatStatus} />
          </PromptInputFooter>
        </PromptInput>
        <ComposerStats />
      </div>
    </footer>
  );
}
