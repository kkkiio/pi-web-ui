import { Settings2Icon, TerminalIcon } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useRef } from "react";
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
  branchEnabled: boolean;
  connection: ConnectionState;
  tree: SessionTreeNode[];
  leafId: string | null;
  selectedEntryId: string | null;
  loadingEntryId: string | null;
  syncing: boolean;
  syncError: string | null;
  onOpenSettings: () => void;
  onBranchTree: (entryId: string) => void;
  onContinueTree: (entryId: string) => void;
  onRefreshTree: () => void;
  onResizeSidebar: (width: number) => void;
  onSelectTree: (entryId: string) => void;
}

export function ConversationSidebar({
  branchEnabled,
  connection,
  tree,
  leafId,
  selectedEntryId,
  loadingEntryId,
  syncing,
  syncError,
  onOpenSettings,
  onBranchTree,
  onContinueTree,
  onRefreshTree,
  onResizeSidebar,
  onSelectTree,
}: ConversationSidebarProps) {
  const suppressRailClickRef = useRef(false);
  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !window.matchMedia("(min-width: 768px)").matches) return;
      const sidebar = event.currentTarget.closest<HTMLElement>("[data-slot='sidebar']");
      if (sidebar?.dataset.state !== "expanded") return;
      event.preventDefault();

      const startX = event.clientX;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      suppressRailClickRef.current = false;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (Math.abs(moveEvent.clientX - startX) < 4 && !suppressRailClickRef.current) return;
        suppressRailClickRef.current = true;
        onResizeSidebar(moveEvent.clientX);
      };

      const stopResize = () => {
        const didResize = suppressRailClickRef.current;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", stopResize);
        document.removeEventListener("pointercancel", stopResize);
        window.setTimeout(() => {
          if (didResize) suppressRailClickRef.current = false;
        }, 120);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stopResize);
      document.addEventListener("pointercancel", stopResize);
    },
    [onResizeSidebar],
  );
  const handleRailClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!suppressRailClickRef.current) return;
    suppressRailClickRef.current = false;
    event.preventDefault();
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-2">
          <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
          <ConnectionDot state={connection} />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-sm">Pi Web UI</div>
            <div className="truncate text-muted-foreground text-xs">Browser interface for Pi</div>
          </div>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <ConversationSidebarTree
          branchEnabled={branchEnabled}
          leafId={leafId}
          loadingEntryId={loadingEntryId}
          onBranch={onBranchTree}
          onContinue={onContinueTree}
          onRefresh={onRefreshTree}
          onSelect={onSelectTree}
          selectedEntryId={selectedEntryId}
          syncError={syncError}
          syncing={syncing}
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
      <SidebarRail
        aria-label="Resize or toggle sidebar"
        onClick={handleRailClick}
        onPointerDown={startSidebarResize}
        title="Drag to resize, click to toggle"
      />
    </Sidebar>
  );
}
