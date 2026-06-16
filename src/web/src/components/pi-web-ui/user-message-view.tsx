import { CheckIcon, CopyIcon, GitForkIcon } from "lucide-react";
import { useState } from "react";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { ChatItem } from "../../core/types";
import { ImagePreviewStrip } from "./image-preview-strip";

export function UserMessageView({
  item,
  onCopy,
  onFork,
}: {
  item: ChatItem & { kind: "message"; role: "user" };
  onCopy: (text: string) => Promise<void> | void;
  onFork?: (entryId: string) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const canCopy = item.text.trim().length > 0 && !item.streaming;
  const canFork = Boolean(onFork && item.entryId && !item.streaming);

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
      <MessageActions className="self-end opacity-0 transition-opacity group-hover:opacity-100">
        {canCopy && (
          <MessageAction label="Copy message" onClick={copyMessage} tooltip="Copy">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </MessageAction>
        )}
        <MessageAction
          disabled={!canFork}
          label="Fork message"
          onClick={() => item.entryId && onFork?.(item.entryId)}
          tooltip={canFork ? "Fork" : "Run /webui in terminal to enable forking"}
        >
          <GitForkIcon className="size-4" />
        </MessageAction>
      </MessageActions>
    </Message>
  );
}
