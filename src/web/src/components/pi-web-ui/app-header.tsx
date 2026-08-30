import { ArrowLeftIcon, GitBranchIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { ConnectionState, GitStatusResult } from "../../core/types";
import { ConnectionDot } from "./connection-dot";

type AppHeaderProps = {
  title: string;
  connection: ConnectionState;
  modelLabel: string;
  isViewingOtherSession: boolean;
  gitStatus: GitStatusResult | null;
  gitLoading: boolean;
  /** Context window size in tokens (0 = unknown). */
  contextWindowSize: number;
  /** Context usage percentage (0-100). */
  contextPercent: number;
  /** Should suggest compaction (80% or higher usage). */
  shouldSuggestCompaction: boolean;
  /** Total cost in dollars. */
  totalCost: number;
  onReturnToLive: () => void;
  onOpenGitDiff: () => void;
  onToggleContext: () => void;
  onCompactContext: () => void;
};

export function AppHeader({
  title,
  connection,
  modelLabel,
  isViewingOtherSession,
  gitStatus,
  gitLoading,
  contextWindowSize,
  contextPercent,
  shouldSuggestCompaction,
  totalCost,
  onReturnToLive,
  onOpenGitDiff,
  onToggleContext,
  onCompactContext,
}: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger aria-label="Toggle left sidebar" className="md:hidden" title="Toggle left sidebar" />
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{title}</div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <ConnectionDot state={connection} />
            <span>{connection}</span>
            <span>/</span>
            <span>{modelLabel}</span>
          </div>
        </div>
      </div>

      {isViewingOtherSession && (
        <Button onClick={onReturnToLive} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon className="size-4" />
          Live
        </Button>
      )}

      <div className="flex items-center gap-1">
        {gitStatus?.isRepo && (
          <Button
            data-testid="header-git-status"
            onClick={onOpenGitDiff}
            size="sm"
            title="Open git changes"
            type="button"
            variant="outline"
          >
            {gitLoading ? <Loader2Icon className="size-4 animate-spin" /> : <GitBranchIcon className="size-4" />}
            <span className="hidden max-w-32 truncate sm:inline">{gitStatus.branch || "Detached HEAD"}</span>
            {gitStatus.hasChanges && (
              <span className="hidden text-xs sm:inline">
                <span className="text-emerald-600">+{gitStatus.additions}</span>{" "}
                <span className="text-destructive">-{gitStatus.deletions}</span>
              </span>
            )}
          </Button>
        )}
        {contextWindowSize > 0 && (
          <Button
            className={cn(shouldSuggestCompaction && "border-amber-500 text-amber-600")}
            onClick={onToggleContext}
            size="sm"
            type="button"
            variant="outline"
          >
            {contextPercent}%
          </Button>
        )}
        {totalCost > 0 && (
          <div className="hidden rounded-md border px-2 py-1 text-muted-foreground text-xs lg:block">
            ${totalCost.toFixed(4)}
          </div>
        )}
        {shouldSuggestCompaction && (
          <Button onClick={onCompactContext} size="sm" type="button" variant="secondary">
            Compact
          </Button>
        )}
      </div>
    </header>
  );
}
