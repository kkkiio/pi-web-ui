import { GitCompareIcon, Loader2Icon, RotateCwIcon, XIcon } from "lucide-react";
import {
  type CSSProperties,
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { RightPanelTab } from "../../core/types";
import type { TranscriptQuote } from "./transcript-quote";

const GitDiffTab = lazy(() => import("./git-diff-tab"));

const DEFAULT_WIDTH = 460;
const MIN_WIDTH = 420;
const MAX_WIDTH = 820;
const MIN_CHAT_WIDTH = 480;
const STORAGE_KEY = "pi-web-ui-right-panel-width";

export function RightPanel({
  activeTabId,
  onCloseTab,
  onQuote,
  theme,
  onRefreshTab,
  onSelectTab,
  tabs,
  visible,
}: {
  activeTabId: string | null;
  onCloseTab: (id: string) => void;
  onQuote: (quote: TranscriptQuote) => void;
  theme: "light" | "dark";
  onRefreshTab: (tab: RightPanelTab) => void;
  onSelectTab: (id: string) => void;
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
      if (event.button !== 0 || !window.matchMedia("(min-width: 1280px)").matches) return;
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

  // Keep the panel mounted while hidden so its scroll position survives.
  return (
    <aside
      className={cn(
        !visible && "!hidden",
        "absolute inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-xl xl:relative xl:z-auto xl:w-[var(--right-panel-width)] xl:shrink-0 xl:shadow-none",
      )}
      style={{ "--right-panel-width": `${panelWidth}px` } as CSSProperties}
    >
      <button
        aria-label="Resize right panel"
        className="group absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-2 cursor-col-resize touch-none appearance-none border-0 bg-transparent p-0 xl:block"
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
                  <GitCompareIcon className="size-3.5 shrink-0" />
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
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? (
          <Suspense
            fallback={
              <div role="status" className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
                <Loader2Icon className="size-4 animate-spin" />
                Loading changes
              </div>
            }
          >
            <GitDiffTab tab={activeTab} theme={theme} onQuote={onQuote} onRetry={() => onRefreshTab(activeTab)} />
          </Suspense>
        ) : null}
      </div>
    </aside>
  );
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
