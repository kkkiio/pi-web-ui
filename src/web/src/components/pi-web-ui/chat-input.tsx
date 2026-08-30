import { BrainIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { getSupportedThinkingLevels } from "../../core/thinking-levels";
import type { ChatSubmitStatus, ConnectionState, ModelInfo } from "../../core/types";
import { ArchModeToggle } from "./arch-mode-toggle";
import { PromptAttachmentButton, PromptAttachmentPreview } from "./prompt-attachments";

type ChatInputProps = {
  viewingHistory: boolean;
  archAvailable: boolean;
  /** Whether an agent is attached; without one there is nowhere to send. */
  agentAttached: boolean;
  connection: ConnectionState;
  archModeEnabled: boolean;
  chatStatus: ChatSubmitStatus;
  modelLabel: string;
  thinkingLevel: string;
  currentModel: ModelInfo | null;
  value: string;
  onSubmit: (opts: { text: string; files?: unknown[] }) => void;
  onAbort: () => void;
  onToggleArchMode: () => void;
  onOpenModelPicker: () => void;
  onSetThinkingLevel: (level: string) => void;
  onValueChange: (value: string) => void;
};

export function ChatInput({
  viewingHistory,
  archAvailable,
  agentAttached,
  connection,
  archModeEnabled,
  chatStatus,
  modelLabel,
  thinkingLevel,
  currentModel,
  value,
  onSubmit,
  onAbort,
  onToggleArchMode,
  onOpenModelPicker,
  onSetThinkingLevel,
  onValueChange,
}: ChatInputProps) {
  const thinkingLevels = getSupportedThinkingLevels(currentModel);
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
          className="rounded-xl border bg-card shadow-sm @container"
          globalDrop={true}
          multiple
          onSubmit={onSubmit}
        >
          <PromptAttachmentPreview />
          <PromptInputBody>
            <PromptInputTextarea
              className="min-h-20 resize-none"
              disabled={!agentAttached}
              onChange={(event) => onValueChange(event.currentTarget.value)}
              placeholder={agentAttached ? "Message Pi..." : "No agent connected — run /webui:connect in Pi"}
              value={value}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton data-testid="model-picker-trigger" onClick={onOpenModelPicker} tooltip="Select model">
                <ChevronsUpDownIcon className="size-4" />
                <span className="max-w-28 truncate text-xs">{modelLabel}</span>
              </PromptInputButton>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger data-testid="thinking-level-trigger" tooltip="Thinking level">
                  <BrainIcon className="size-4" />
                  <span className="text-xs">{thinkingLevel}</span>
                </PromptInputActionMenuTrigger>
                <PromptInputActionMenuContent align="start" side="top">
                  {thinkingLevels.map((level) => (
                    <PromptInputActionMenuItem key={level} onSelect={() => onSetThinkingLevel(level)}>
                      <CheckIcon className={cn("size-4", level === thinkingLevel ? "opacity-100" : "opacity-0")} />
                      <span className={cn(level === thinkingLevel && "font-medium")}>{level}</span>
                    </PromptInputActionMenuItem>
                  ))}
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              {archAvailable && (
                <ArchModeToggle
                  disabled={connection !== "connected"}
                  enabled={archModeEnabled}
                  onToggle={onToggleArchMode}
                />
              )}
              <PromptAttachmentButton />
              <div className="hidden items-center gap-1 whitespace-nowrap px-2 text-muted-foreground text-xs @[560px]:flex">
                Enter sends, Shift+Enter inserts a newline
              </div>
            </PromptInputTools>
            <PromptInputSubmit disabled={!agentAttached} onStop={onAbort} status={chatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </footer>
  );
}
