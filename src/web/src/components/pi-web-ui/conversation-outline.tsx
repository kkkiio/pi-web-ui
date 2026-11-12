import { ListIcon } from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatItem } from "../../core/types";

export function ConversationOutline({ items }: { items: ChatItem[] }) {
  const { stopScroll } = useStickToBottomContext();
  const messages = items.filter((item) => item.kind === "message").filter((item) => item.role === "user");

  if (!messages.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex max-w-3xl justify-end px-4">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Conversation outline"
            className="pointer-events-auto size-8 rounded-full bg-background shadow-xs"
            size="icon"
            variant="outline"
          >
            <ListIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(19rem,var(--radix-dropdown-menu-content-available-height))] rounded-xl bg-popover/95 p-1.5 backdrop-blur-sm"
          side="top"
          sideOffset={8}
        >
          {messages.map((message) => (
            <DropdownMenuItem
              className="cursor-pointer px-2.5 py-2"
              key={message.id}
              onSelect={() => {
                stopScroll();
                document.getElementById(`user-message-${message.id}`)?.scrollIntoView({ block: "start" });
              }}
            >
              <span className="truncate">{message.text.trim().replace(/\s+/g, " ") || "Image attachment"}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
