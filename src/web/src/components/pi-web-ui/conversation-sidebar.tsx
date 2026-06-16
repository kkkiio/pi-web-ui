import { Settings2Icon, TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { ConnectionState, SessionTreeNode } from "../../core/types";
import { ConnectionDot } from "./connection-dot";
import { ConversationSidebarTree } from "./conversation-sidebar-tree";

interface ConversationSidebarProps {
  connection: ConnectionState;
  sessionName: string;
  modelLabel: string;
  tree: SessionTreeNode[];
  leafId: string | null;
  selectedEntryId: string | null;
  loadingEntryId: string | null;
  onOpenSettings: () => void;
  onBrowseTree: (entryId: string) => void;
}

export function ConversationSidebar({
  connection,
  sessionName,
  modelLabel,
  tree,
  leafId,
  selectedEntryId,
  loadingEntryId,
  onOpenSettings,
  onBrowseTree,
}: ConversationSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-2">
          <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-sm">Pi Web UI</div>
            <div className="truncate text-muted-foreground text-xs">Browser interface for Pi</div>
          </div>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <ConnectionDot state={connection} />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm">{sessionName}</div>
            <div className="truncate text-muted-foreground text-xs">{modelLabel}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <ConversationSidebarTree
          leafId={leafId}
          loadingEntryId={loadingEntryId}
          onBrowse={onBrowseTree}
          selectedEntryId={selectedEntryId}
          tree={tree}
        />
      </SidebarContent>

      <SidebarFooter>
        <Button
          className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={onOpenSettings}
          type="button"
          variant="ghost"
        >
          <Settings2Icon className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">Settings</span>
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
