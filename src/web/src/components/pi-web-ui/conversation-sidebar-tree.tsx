import {
  ArrowRightToLineIcon,
  ChevronRightIcon,
  GitBranchPlusIcon,
  LocateFixedIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { highlightSegments } from "../../core/format";
import type { ConversationTreeItem, SessionTreeNode } from "../../core/types";
import { useConversationTree } from "./use-conversation-tree";

const TREE_GUTTER_WIDTH = 16;

export function ConversationSidebarTree({
  branchEnabled,
  tree,
  leafId,
  selectedEntryId,
  loadingEntryId,
  syncing,
  syncError,
  onBranch,
  onContinue,
  onRefresh,
  onSelect,
}: {
  branchEnabled: boolean;
  tree: SessionTreeNode[];
  leafId: string | null;
  selectedEntryId: string | null;
  loadingEntryId: string | null;
  syncing: boolean;
  syncError: string | null;
  onBranch: (entryId: string) => void;
  onContinue: (entryId: string) => void;
  onRefresh: () => void;
  onSelect: (entryId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim();
  const { currentEntryId, currentOrder, items, toggleExpanded } = useConversationTree(tree, leafId, normalizedQuery);

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
            {items.length === 0 ? (
              <div className="p-2 text-muted-foreground text-sm">No matching nodes</div>
            ) : (
              <SidebarMenu>
                {items.map((item) => (
                  <ConversationTreeRow
                    branchEnabled={branchEnabled}
                    currentOrder={currentOrder}
                    item={item}
                    key={item.id}
                    loadingEntryId={loadingEntryId}
                    onBranch={onBranch}
                    onContinue={onContinue}
                    onSelect={onSelect}
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

function ConversationTreeRow({
  branchEnabled,
  item,
  currentOrder,
  loadingEntryId,
  query,
  selectedEntryId,
  onBranch,
  onContinue,
  onSelect,
  onToggleExpand,
}: {
  branchEnabled: boolean;
  item: ConversationTreeItem;
  currentOrder: number;
  loadingEntryId: string | null;
  query: string;
  selectedEntryId: string | null;
  onBranch: (entryId: string) => void;
  onContinue: (entryId: string) => void;
  onSelect: (entryId: string) => void;
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
  const branchTitle = branchEnabled ? "Branch from here" : "Run /webui in terminal to enable branching";
  const continueTitle = branchEnabled ? "Continue from branch end" : "Run /webui in terminal to enable branching";
  const title = item.detail ? `${item.text} - ${item.detail}` : item.text;

  const selectFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(item.id);
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(
          "h-7 gap-0 px-1 text-xs",
          item.isBranchable &&
            "font-medium text-sky-950 data-[active=true]:text-sky-950 dark:text-sky-100 dark:data-[active=true]:text-sky-100",
          inactive && "text-sidebar-foreground/45 hover:text-sidebar-accent-foreground",
          item.isBranchable && inactive && "text-sky-950/45 hover:text-sky-950 dark:text-sky-100/45",
          loading && "animate-pulse",
        )}
        isActive={active}
        size="sm"
        title={title}
      >
        <div
          data-tree-entry-id={item.id}
          data-tree-depth={item.depth}
          data-tree-search-match={item.isSearchMatch ? "true" : undefined}
          onClick={() => onSelect(item.id)}
          onKeyDown={selectFromKeyboard}
          role="button"
          tabIndex={0}
        >
          <TreeGutter item={item} onToggleExpand={onToggleExpand} />
          <TreeActionSlot
            branchEnabled={branchEnabled}
            branchTitle={branchTitle}
            continueTitle={continueTitle}
            item={item}
            loading={loading}
            onBranch={onBranch}
            onContinue={onContinue}
          />
          <span className="min-w-0 flex-1 truncate">
            {renderHighlightedSegments(segments)}
            {item.detail && (
              <span className={cn("text-muted-foreground", inactive && "text-sidebar-foreground/35")}>
                {" · "}
                {renderHighlightedSegments(detailSegments)}
              </span>
            )}
          </span>
          {item.hiddenChildCount > 0 && (
            <span className="ml-1 shrink-0 rounded-sm bg-sidebar-accent px-1 text-[10px] text-muted-foreground">
              +{item.hiddenChildCount}
            </span>
          )}
        </div>
      </SidebarMenuButton>
      {!query && currentOrder === item.order && <div className="my-1 h-px bg-sidebar-border" />}
    </SidebarMenuItem>
  );
}

function TreeGutter({
  item,
  onToggleExpand,
}: {
  item: ConversationTreeItem;
  onToggleExpand: (entryId: string) => void;
}) {
  return (
    <span
      aria-hidden={!item.isExpandable}
      className="flex h-7 shrink-0 items-center"
      style={{ width: (item.connectorColumns.length + 1) * TREE_GUTTER_WIDTH }}
    >
      {item.connectorColumns.map((column) => (
        <span className="relative h-7 w-4 shrink-0" key={column.key}>
          {column.state === "line" && <span className="absolute inset-y-[-0.25rem] left-1/2 w-px bg-sidebar-border" />}
        </span>
      ))}
      <span className="relative flex h-7 w-4 shrink-0 items-center justify-center">
        <CurrentConnector kind={item.connectorKind} />
        {item.isExpandable && (
          <button
            aria-label={item.isExpanded ? "Collapse branch" : "Expand branch"}
            className="relative z-[2] flex size-4 items-center justify-center rounded-sm bg-sidebar text-muted-foreground hover:bg-background hover:text-sidebar-foreground"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleExpand(item.id);
            }}
            title={item.isExpanded ? "Collapse branch" : "Expand branch"}
            type="button"
          >
            <ChevronRightIcon className={cn("size-3 transition-transform", item.isExpanded && "rotate-90")} />
          </button>
        )}
      </span>
    </span>
  );
}

function CurrentConnector({ kind }: { kind: ConversationTreeItem["connectorKind"] }) {
  if (kind === "none" || kind === "blank") return null;

  return (
    <>
      {kind === "middle" && <span className="absolute inset-y-[-0.25rem] left-1/2 w-px bg-sidebar-border" />}
      {kind === "last" && <span className="absolute left-1/2 top-[-0.25rem] h-[1.125rem] w-px bg-sidebar-border" />}
      {kind === "line" && <span className="absolute inset-y-[-0.25rem] left-1/2 w-px bg-sidebar-border" />}
      {(kind === "middle" || kind === "last") && (
        <span className="absolute left-1/2 top-1/2 h-px w-1/2 bg-sidebar-border" />
      )}
    </>
  );
}

function TreeActionSlot({
  branchEnabled,
  branchTitle,
  continueTitle,
  item,
  loading,
  onBranch,
  onContinue,
}: {
  branchEnabled: boolean;
  branchTitle: string;
  continueTitle: string;
  item: ConversationTreeItem;
  loading: boolean;
  onBranch: (entryId: string) => void;
  onContinue: (entryId: string) => void;
}) {
  const actionClass =
    "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <span className="flex h-7 w-5 shrink-0 items-center justify-center">
      {item.isBranchable ? (
        <button
          aria-label={branchTitle}
          className={actionClass}
          disabled={loading || !branchEnabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!branchEnabled) return;
            onBranch(item.id);
          }}
          title={branchTitle}
          type="button"
        >
          <GitBranchPlusIcon className="size-3.5" />
        </button>
      ) : item.isContinuable && item.continueTargetId ? (
        <button
          aria-label="Continue branch"
          className={actionClass}
          disabled={loading || !branchEnabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!branchEnabled || !item.continueTargetId) return;
            onContinue(item.continueTargetId);
          }}
          title={continueTitle}
          type="button"
        >
          <ArrowRightToLineIcon className="size-3.5" />
        </button>
      ) : (
        <span aria-hidden="true" className="size-5 shrink-0" />
      )}
    </span>
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
