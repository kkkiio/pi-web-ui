import {
  CopyIcon,
  FileTextIcon,
  GitCompareIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { copyText } from "../../core/format";
import type { RightPanelTab } from "../../core/types";

const DEFAULT_WIDTH = 460;
const MIN_WIDTH = 340;
const MAX_WIDTH = 820;
const MIN_CHAT_WIDTH = 480;
const STORAGE_KEY = "pi-web-ui-right-panel-width";

export function RightPanel({
  activeTabId,
  onCloseTab,
  onRefreshTab,
  onSelectTab,
  onToggleVisible,
  tabs,
  visible,
}: {
  activeTabId: string | null;
  onCloseTab: (id: string) => void;
  onRefreshTab: (tab: RightPanelTab) => void;
  onSelectTab: (id: string) => void;
  onToggleVisible: () => void;
  tabs: RightPanelTab[];
  visible: boolean;
}) {
  const [panelWidth, setPanelWidth] = useState(() => getInitialWidth());
  const [isResizing, setIsResizing] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null;

  const updateWidth = useCallback((nextWidth: number) => {
    setPanelWidth(clampPanelWidth(nextWidth));
  }, []);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !window.matchMedia("(min-width: 768px)").matches) return;
      event.preventDefault();

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setIsResizing(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updateWidth(window.innerWidth - moveEvent.clientX);
      };

      const stopResize = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setIsResizing(false);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", stopResize);
        document.removeEventListener("pointercancel", stopResize);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stopResize);
      document.addEventListener("pointercancel", stopResize);
    },
    [updateWidth],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    const handleResize = () => setPanelWidth((current) => clampPanelWidth(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!visible) {
    return (
      <Button
        className="fixed right-3 top-16 z-40 shadow-lg"
        onClick={onToggleVisible}
        size="icon-sm"
        title="Show right panel"
        type="button"
        variant="outline"
      >
        <PanelRightOpenIcon className="size-4" />
      </Button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-xl md:relative md:z-auto md:w-[var(--right-panel-width)] md:shrink-0 md:shadow-none"
      style={{ "--right-panel-width": `${panelWidth}px` } as CSSProperties}
    >
      <button
        aria-label="Resize right panel"
        className="group absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-2 cursor-col-resize touch-none appearance-none border-0 bg-transparent p-0 md:block"
        onDoubleClick={() => updateWidth(DEFAULT_WIDTH)}
        onPointerDown={startResize}
        title="Drag to resize"
        type="button"
      >
        <div className="mx-auto h-full w-px bg-border" />
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full transition-colors",
            isResizing ? "bg-primary" : "bg-transparent group-hover:bg-primary/70",
          )}
        />
      </button>

      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1">
            {tabs.map((tab) => (
              <div
                className={cn(
                  "flex max-w-44 items-center rounded-md text-sm transition-colors",
                  tab.id === activeTab?.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
                key={tab.id}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left"
                  onClick={() => onSelectTab(tab.id)}
                  type="button"
                >
                  {tab.kind === "git-diff" ? (
                    <GitCompareIcon className="size-3.5 shrink-0" />
                  ) : (
                    <FileTextIcon className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{tab.title}</span>
                </button>
                <button
                  className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  onClick={() => onCloseTab(tab.id)}
                  title="Close tab"
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {activeTab && (
          <Button
            onClick={() => onRefreshTab(activeTab)}
            size="icon-sm"
            title="Refresh tab"
            type="button"
            variant="ghost"
          >
            <RotateCwIcon className="size-4" />
          </Button>
        )}
        <Button onClick={onToggleVisible} size="icon-sm" title="Hide right panel" type="button" variant="ghost">
          <PanelRightCloseIcon className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {activeTab ? <RightPanelTabContent tab={activeTab} /> : <EmptyPanel />}
      </div>
    </aside>
  );
}

function RightPanelTabContent({ tab }: { tab: RightPanelTab }) {
  if (tab.loading) return <LoadingPanel label={tab.kind === "git-diff" ? "Loading diff" : "Loading file"} />;
  if (tab.error) return <PanelMessage tone="error" title="Unable to load" body={tab.error} />;
  if (tab.kind === "git-diff") return <GitDiffTab tab={tab} />;
  return <ArtifactFileTab tab={tab} />;
}

function GitDiffTab({ tab }: { tab: Extract<RightPanelTab, { kind: "git-diff" }> }) {
  if (!tab.isRepo) {
    return <PanelMessage title="No git repository" body="Open a git workspace to view changes." />;
  }
  if (!tab.diff?.trim()) {
    return <PanelMessage title="No changes" body="The current branch has no staged, unstaged, or untracked diff." />;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm">Changes</div>
          <div className="truncate text-muted-foreground text-xs">{tab.branch || "Detached HEAD"}</div>
        </div>
        <Button
          onClick={() => void copyText(tab.diff || "")}
          size="icon-sm"
          title="Copy diff"
          type="button"
          variant="ghost"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre rounded-md border bg-muted/30 p-3 text-xs leading-5">
        {tab.diff}
      </pre>
    </section>
  );
}

function ArtifactFileTab({ tab }: { tab: Extract<RightPanelTab, { kind: "artifact-file" }> }) {
  if (!tab.content?.trim()) {
    return <PanelMessage title={tab.title} body="This artifact file is empty." />;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{tab.title}</div>
          <div className="truncate text-muted-foreground text-xs">{tab.path}</div>
        </div>
        <Button
          onClick={() => void copyText(tab.content || "")}
          size="icon-sm"
          title="Copy file content"
          type="button"
          variant="ghost"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <div className="rounded-md border bg-card p-3">
        <MessageResponse className="break-words text-sm leading-6 [&_pre]:overflow-x-auto">
          {tab.content}
        </MessageResponse>
      </div>
    </section>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function PanelMessage({ body, title, tone = "muted" }: { body: string; title: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-3 text-sm",
        tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted/30",
      )}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-muted-foreground">{body}</div>
    </div>
  );
}

function EmptyPanel() {
  return <PanelMessage title="No tab selected" body="Open changes or an artifact from the workspace float." />;
}

function getInitialWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const storedWidth = Number(localStorage.getItem(STORAGE_KEY));
  return clampPanelWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : DEFAULT_WIDTH);
}

function clampPanelWidth(width: number): number {
  return Math.min(panelMaxWidth(), Math.max(MIN_WIDTH, Math.round(width)));
}

function panelMaxWidth(): number {
  if (typeof window === "undefined") return MAX_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - MIN_CHAT_WIDTH));
}
