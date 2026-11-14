import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Message, MessageAction, MessageActions, MessageContent } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatItem } from "../../core/types";
import { ImagePreviewStrip } from "./image-preview-strip";
import { UserMessageContent } from "./user-message-content";

export function UserMessageView({
  item,
  onEdit,
  editDisabled,
  onCopy,
}: {
  item: ChatItem & { kind: "message"; role: "user" };
  onEdit?: (entryId: string, text: string) => Promise<void>;
  editDisabled: boolean;
  onCopy: (text: string) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      editor.current?.focus();
      editor.current?.setSelectionRange(editor.current.value.length, editor.current.value.length);
    }
  }, [editing]);
  // Text changes require measuring the rendered textarea again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize after each text update
  useEffect(() => {
    if (editing && editor.current) {
      editor.current.style.height = "auto";
      editor.current.style.height = `${editor.current.scrollHeight}px`;
    }
  }, [editing, text]);
  const canEdit = Boolean(onEdit && item.entryId && !editDisabled && !item.streaming);
  const save = async () => {
    if (!canEdit || !text.trim() || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      await onEdit?.(item.entryId as string, text.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <Message className="is-user ml-auto justify-end" from="user">
      <MessageContent className="is-user:dark ml-auto min-w-0 max-w-full rounded-lg bg-secondary px-4 py-3 text-sm text-foreground">
        {item.images && <ImagePreviewStrip images={item.images} readonly />}
        {editing ? (
          <div className="w-full space-y-2 sm:min-w-80">
            <Textarea
              aria-label="Edit message"
              ref={editor}
              value={text}
              disabled={saving}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape" && !saving) {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditing(false);
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void save();
                }
              }}
            />
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={!canEdit || saving || !text.trim()} onClick={() => void save()}>
                {saving ? "Saving..." : "Save & Send"}
              </Button>
            </div>
          </div>
        ) : (
          <div data-quote-source="User">
            <UserMessageContent>{item.text}</UserMessageContent>
          </div>
        )}
      </MessageContent>
      {!editing && (
        <MessageActions className="self-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {item.text.trim() && !item.streaming && (
            <MessageAction
              label="Copy message"
              tooltip="Copy"
              onClick={async () => {
                await onCopy(item.text);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </MessageAction>
          )}
          <MessageAction
            disabled={!canEdit}
            label="Edit message"
            tooltip={
              !onEdit
                ? "Run /webui in terminal to enable editing"
                : editDisabled
                  ? "Wait for the current operation to finish"
                  : "Edit message"
            }
            onClick={() => {
              setText(item.text);
              setError(null);
              setEditing(true);
            }}
          >
            <PencilIcon className="size-4" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}
