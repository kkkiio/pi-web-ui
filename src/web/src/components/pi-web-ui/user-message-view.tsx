import { CheckIcon, CopyIcon, GitBranchPlusIcon } from "lucide-react";
import { useState } from "react";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import type { ChatItem } from "../../core/types";
import { ImagePreviewStrip } from "./image-preview-strip";

export function UserMessageView({
  actionsVisible,
  item,
  onBranch,
  onCopy,
}: {
  actionsVisible?: boolean;
  item: ChatItem & { kind: "message"; role: "user" };
  onBranch?: (entryId: string) => Promise<void> | void;
  onCopy: (text: string) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const canCopy = item.text.trim().length > 0 && !item.streaming;
  const canBranch = Boolean(onBranch && item.entryId && !item.streaming);

  const copyMessage = async () => {
    if (!canCopy) return;
    await onCopy(item.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Message className="is-user ml-auto justify-end" from="user">
      <MessageContent className="is-user:dark ml-auto min-w-0 max-w-full rounded-lg bg-secondary px-4 py-3 text-sm text-foreground">
        {item.images && <ImagePreviewStrip images={item.images} readonly />}
        <MessageResponse>{item.text}</MessageResponse>
      </MessageContent>
      <MessageActions
        className={cn("self-end opacity-0 transition-opacity group-hover:opacity-100", actionsVisible && "opacity-100")}
      >
        {canCopy && (
          <MessageAction label="Copy message" onClick={copyMessage} tooltip="Copy">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </MessageAction>
        )}
        <MessageAction
          disabled={!canBranch}
          label="Branch from message"
          onClick={() => item.entryId && onBranch?.(item.entryId)}
          tooltip={canBranch ? "Branch from message" : "Run /webui in terminal to enable branching"}
        >
          <GitBranchPlusIcon className="size-4" />
        </MessageAction>
      </MessageActions>
    </Message>
  );
}
