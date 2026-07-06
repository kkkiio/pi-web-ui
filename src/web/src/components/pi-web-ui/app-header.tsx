import { ArrowLeftIcon, BrainIcon, ChevronsUpDownIcon, CommandIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "../../core/types";
import { ConnectionDot } from "./connection-dot";

type AppHeaderProps = {
  title: string;
  connection: ConnectionState;
  modelLabel: string;
  thinkingLevel: string;
  isViewingOtherSession: boolean;
  /** Context window size in tokens (0 = unknown). */
  contextWindowSize: number;
  /** Context usage percentage (0-100). */
  contextPercent: number;
  /** Should suggest compaction (80% or higher usage). */
  shouldSuggestCompaction: boolean;
  /** Total cost in dollars. */
  totalCost: number;
  onReturnToLive: () => void;
  onOpenModelPicker: () => void;
  onCycleThinking: () => void;
  onToggleContext: () => void;
  onCompactContext: () => void;
  onOpenCommandPalette: () => void;
};

export function AppHeader({
  title,
  connection,
  modelLabel,
  thinkingLevel,
  isViewingOtherSession,
  contextWindowSize,
  contextPercent,
  shouldSuggestCompaction,
  totalCost,
  onReturnToLive,
  onOpenModelPicker,
  onCycleThinking,
  onToggleContext,
  onCompactContext,
  onOpenCommandPalette,
}: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{title}</div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <ConnectionDot state={connection} />
          <span>{connection}</span>
          <span>/</span>
          <span>{modelLabel}</span>
        </div>
      </div>

      {isViewingOtherSession && (
        <Button onClick={onReturnToLive} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon className="size-4" />
          Live
        </Button>
      )}

      <div className="flex items-center gap-1">
        <Button onClick={onOpenModelPicker} size="sm" type="button" variant="outline">
          <ChevronsUpDownIcon className="size-4" />
          <span className="hidden sm:inline">{modelLabel}</span>
        </Button>
        <Button onClick={onCycleThinking} size="sm" type="button" variant="outline">
          <BrainIcon className="size-4" />
          <span className="hidden sm:inline">{thinkingLevel}</span>
        </Button>
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
        <Button onClick={onOpenCommandPalette} size="icon-sm" type="button" variant="ghost">
          <CommandIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}
