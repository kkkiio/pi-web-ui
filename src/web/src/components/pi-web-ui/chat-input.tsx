import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import type { ChatSubmitStatus, ConnectionState } from "../../core/types";
import { ArchModeToggle } from "./arch-mode-toggle";
import { PromptAttachmentButton, PromptAttachmentPreview } from "./prompt-attachments";

type ChatInputProps = {
  viewingHistory: boolean;
  archAvailable: boolean;
  connection: ConnectionState;
  archModeEnabled: boolean;
  chatStatus: ChatSubmitStatus;
  value: string;
  onSubmit: (opts: { text: string; files?: unknown[] }) => void;
  onAbort: () => void;
  onToggleArchMode: () => void;
  onValueChange: (value: string) => void;
};

export function ChatInput({
  viewingHistory,
  archAvailable,
  connection,
  archModeEnabled,
  chatStatus,
  value,
  onSubmit,
  onAbort,
  onToggleArchMode,
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
          <PromptAttachmentPreview />
          <PromptInputBody>
            <PromptInputTextarea
              className="min-h-20 resize-none"
              onChange={(event) => onValueChange(event.currentTarget.value)}
              placeholder="Message Pi..."
              value={value}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {archAvailable && (
                <ArchModeToggle
                  disabled={connection !== "connected"}
                  enabled={archModeEnabled}
                  onToggle={onToggleArchMode}
                />
              )}
              <PromptAttachmentButton />
              <div className="hidden items-center gap-1 px-2 text-muted-foreground text-xs sm:flex">
                Enter sends, Shift+Enter inserts a newline
              </div>
            </PromptInputTools>
            <PromptInputSubmit onStop={onAbort} status={chatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </footer>
  );
}
