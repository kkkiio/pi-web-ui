import { ChevronRightIcon, LocateFixedIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { highlightSegments } from "../../core/format";
import type { ConversationTreeItem, SessionTreeNode } from "../../core/types";
import { useConversationTree } from "./use-conversation-tree";

export function ConversationSidebarTree({
  tree,
  leafId,
  selectedEntryId,
  loadingEntryId,
  syncing,
  syncError,
  onBrowse,
  onRefresh,
}: {
  tree: SessionTreeNode[];
  leafId: string | null;
  selectedEntryId: string | null;
  loadingEntryId: string | null;
  syncing: boolean;
  syncError: string | null;
  onBrowse: (entryId: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim();
  const { currentEntryId, currentOrder, items, toggleExpanded, visibleItems } = useConversationTree(
    tree,
    leafId,
    normalizedQuery,
  );

  useEffect(() => {
    if (!currentEntryId) return;
    const target = containerRef.current?.querySelector<HTMLElement>(
      `[data-tree-entry-id="${CSS.escape(currentEntryId)}"]`,
    );
    target?.scrollIntoView({ block: "center" });
  }, [currentEntryId]);

  const refreshTitle = syncError ? `Refresh conversation failed: ${syncError}` : "Refresh conversation";

  return (
    <SidebarGroup className="min-h-0 flex-1">
      <div className="flex items-center gap-1 px-2">
        <SidebarGroupLabel className="min-w-0 flex-1 px-0">Conversation</SidebarGroupLabel>
        <Button
          aria-label={refreshTitle}
          disabled={syncing}
          onClick={onRefresh}
          size="icon-xs"
          title={refreshTitle}
          type="button"
          variant="ghost"
        >
          <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin", syncError && "text-destructive")} />
        </Button>
        <Button
          disabled={!currentEntryId}
          onClick={() => {
            const target = currentEntryId
              ? containerRef.current?.querySelector<HTMLElement>(`[data-tree-entry-id="${CSS.escape(currentEntryId)}"]`)
              : null;
            target?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
          size="icon-xs"
          title="Scroll to current"
          type="button"
          variant="ghost"
        >
          <LocateFixedIcon className="size-3.5" />
        </Button>
      </div>
      {tree.length === 0 ? (
        <SidebarGroupContent className="p-2 text-muted-foreground text-sm">Start a conversation</SidebarGroupContent>
      ) : (
        <>
          <div className="relative px-2 pb-2">
            <SearchIcon className="absolute left-4 top-2 size-3.5 text-muted-foreground" />
            <SidebarInput
              className="h-8 pl-7 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversation..."
              value={query}
            />
          </div>
          <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto px-1" ref={containerRef}>
            {visibleItems.length === 0 ? (
              <div className="p-2 text-muted-foreground text-sm">No matching nodes</div>
            ) : (
              <SidebarMenu>
                {items.map((item) => (
                  <ConversationTreeMenuItem
                    currentOrder={currentOrder}
                    item={item}
                    key={item.id}
                    loadingEntryId={loadingEntryId}
                    onBrowse={onBrowse}
                    onToggleExpand={toggleExpanded}
                    query={normalizedQuery}
                    selectedEntryId={selectedEntryId}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </>
      )}
    </SidebarGroup>
  );
}

function ConversationTreeMenuItem({
  item,
  currentOrder,
  loadingEntryId,
  query,
  selectedEntryId,
  onBrowse,
  onToggleExpand,
}: {
  item: ConversationTreeItem;
  currentOrder: number;
  loadingEntryId: string | null;
  query: string;
  selectedEntryId: string | null;
  onBrowse: (entryId: string) => void;
  onToggleExpand: (entryId: string) => void;
}) {
  const segments = query ? highlightSegments(item.text, query) : [{ text: item.text, match: false, offset: 0 }];
  const detailSegments =
    query && item.detail
      ? highlightSegments(item.detail, query)
      : [{ text: item.detail || "", match: false, offset: 0 }];
  const inactive = !query && currentOrder >= 0 && item.order > currentOrder;
  const selected = selectedEntryId === item.id;
  const active = item.isLeaf || selected;
  const loading = loadingEntryId === item.id;
  const contentOpen = item.isExpandable ? item.isExpanded : true;
  const title = item.detail ? `${item.text} - ${item.detail}` : item.text;
  const treeConnectorClass = item.isBranchChild
    ? cn(
        "relative before:pointer-events-none before:absolute before:left-[-0.625rem] before:top-3.5 before:z-[1] before:h-px before:w-2.5 before:bg-sidebar-border before:content-['']",
        "after:pointer-events-none after:absolute after:left-[-0.625rem] after:z-[1] after:w-px after:bg-sidebar-border after:content-['']",
        item.isFirstBranchChild && !item.isLastBranchChild && "after:top-3.5 after:bottom-[-0.25rem]",
        !item.isFirstBranchChild && !item.isLastBranchChild && "after:inset-y-[-0.25rem]",
        item.isLastBranchChild && "after:top-[-0.25rem] after:h-[1.125rem]",
      )
    : undefined;
  const button = (
    <SidebarMenuButton
      className={cn(
        "relative z-[2] h-7 gap-1.5 px-2 text-xs",
        item.isForkable &&
          "font-medium text-sky-950 data-[active=true]:text-sky-950 dark:text-sky-100 dark:data-[active=true]:text-sky-100",
        item.hiddenChildCount > 0 && "pr-7",
        inactive && "text-sidebar-foreground/45 hover:text-sidebar-accent-foreground",
        item.isForkable && inactive && "text-sky-950/45 hover:text-sky-950 dark:text-sky-100/45",
        loading && "animate-pulse",
      )}
      data-tree-entry-id={item.id}
      data-tree-branch-child={item.isBranchChild ? "true" : undefined}
      data-tree-forkable={item.isForkable ? "true" : undefined}
      isActive={active}
      onClick={() => onBrowse(item.id)}
      size="sm"
      title={title}
      type="button"
    >
      {item.isExpandable ? (
        <CollapsibleTrigger asChild>
          <span
            aria-label={item.isExpanded ? "Collapse branch" : "Expand branch"}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="button"
            tabIndex={0}
          >
            <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </span>
        </CollapsibleTrigger>
      ) : null}
      {item.isForkable && (
        <span
          aria-hidden="true"
          className={cn(
            "h-4 w-0.5 shrink-0 rounded-full bg-sky-500/80 dark:bg-sky-400/80",
            inactive && "bg-sky-500/35 dark:bg-sky-400/35",
          )}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {renderHighlightedSegments(segments)}
        {item.detail && (
          <span className={cn("text-muted-foreground", inactive && "text-sidebar-foreground/35")}>
            {" · "}
            {renderHighlightedSegments(detailSegments)}
          </span>
        )}
      </span>
    </SidebarMenuButton>
  );

  if (!item.children.length && !item.isExpandable) {
    return (
      <SidebarMenuItem className={treeConnectorClass}>
        {button}
        {!query && currentOrder === item.order && <div className="my-1 h-px bg-sidebar-border" />}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className={treeConnectorClass}>
      <Collapsible
        className="group/collapsible"
        onOpenChange={() => item.isExpandable && onToggleExpand(item.id)}
        open={contentOpen}
      >
        {button}
        {item.hiddenChildCount > 0 && <SidebarMenuBadge>+{item.hiddenChildCount}</SidebarMenuBadge>}
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 border-l-0 pr-0">
            {item.children.map((child) => (
              <ConversationTreeMenuItem
                currentOrder={currentOrder}
                item={child}
                key={child.id}
                loadingEntryId={loadingEntryId}
                onBrowse={onBrowse}
                onToggleExpand={onToggleExpand}
                query={query}
                selectedEntryId={selectedEntryId}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
      {!query && currentOrder === item.order && <div className="my-1 h-px bg-sidebar-border" />}
    </SidebarMenuItem>
  );
}

function renderHighlightedSegments(segments: Array<{ text: string; match: boolean; offset: number }>) {
  return segments.map((segment) =>
    segment.match ? (
      <mark className="rounded bg-primary/20 px-0.5 text-foreground" key={segment.offset}>
        {segment.text}
      </mark>
    ) : (
      <span key={segment.offset}>{segment.text}</span>
    ),
  );
}
