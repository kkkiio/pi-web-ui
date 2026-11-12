import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ChatItem } from "../../core/types";

export function groupConversationActivity(items: ChatItem[]) {
  const groups: ChatItem[][] = [];
  let activity: ChatItem[] | undefined;

  for (const item of items) {
    const groupable =
      item.kind === "tool"
        ? !/^sub[-_]?agents?$/i.test(item.name)
        : item.kind === "message" && item.role === "assistant" && item.presentation === "activity";

    if (!groupable) {
      groups.push([item]);
      activity = undefined;
      continue;
    }

    if (!activity) {
      activity = [];
      groups.push(activity);
    }
    activity.push(item);
  }
  return groups;
}

export function TranscriptActivity({ items, children }: { items: ChatItem[]; children: ReactNode }) {
  const [open, setOpen] = useState<boolean>();
  const tools = items.filter((item) => item.kind === "tool");
  const running = items.some((item) =>
    item.kind === "tool"
      ? item.state === "input-available" || item.state === "input-streaming"
      : item.kind === "message" && item.streaming,
  );
  const failed = tools.filter((tool) => tool.state === "output-error").length;

  return (
    <Collapsible open={open ?? running} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/activity flex max-w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground text-sm hover:text-foreground">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/activity:rotate-90" />
        <span>
          {tools.length
            ? `${tools.length} tool call${tools.length === 1 ? "" : "s"}`
            : `${items.length} assistant updates`}
        </span>
        {failed > 0 && <span className="text-destructive">· {failed} failed</span>}
        {running && <span>· Running</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 mt-1 flex flex-col gap-2 border-l pl-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
