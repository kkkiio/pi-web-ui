import {
  ArrowLeftIcon,
  BrainIcon,
  ChevronsUpDownIcon,
  CommandIcon,
  GitCompareIcon,
  PanelRightIcon,
  SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { THINKING_LEVELS } from "../../core/constants";
import type { ConnectionState, GitStatusResult } from "../../core/types";
import { ConnectionDot } from "./connection-dot";

type AppHeaderProps = {
  gitStatus: GitStatusResult | null;
  gitLoading: boolean;
  rightPanelOpen: boolean;
  onOpenGitDiff: () => void;
  onOpenSettings: () => void;
  onToggleRightPanel: () => void;
  title: string;
  connection: ConnectionState;
  modelLabel: string;
  thinkingLevel: string;
  isViewingOtherSession: boolean;
  /** Should suggest compaction (80% or higher usage). */
  shouldSuggestCompaction: boolean;
  onReturnToLive: () => void;
  onOpenModelPicker: () => void;
  onSetThinking: (level: string) => void;
  onCompactContext: () => void;
  onOpenCommandPalette: () => void;
};

export function AppHeader({
  gitStatus,
  gitLoading,
  rightPanelOpen,
  onOpenGitDiff,
  onOpenSettings,
  onToggleRightPanel,
  title,
  connection,
  modelLabel,
  thinkingLevel,
  isViewingOtherSession,
  shouldSuggestCompaction,
  onReturnToLive,
  onOpenModelPicker,
  onSetThinking,
  onCompactContext,
  onOpenCommandPalette,
}: AppHeaderProps) {
  return (
    <header className="flex min-h-14 flex-wrap shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <div className="min-w-0 w-full sm:w-auto sm:flex-1">
        <div className="truncate font-medium text-sm">{title}</div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <ConnectionDot state={connection} />
          <span>{connection}</span>
          <span>/</span>
          <span className="truncate">{modelLabel}</span>
        </div>
      </div>

      {isViewingOtherSession && (
        <Button onClick={onReturnToLive} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon className="size-4" />
          Live
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <Button aria-label="Choose model" onClick={onOpenModelPicker} size="sm" type="button" variant="outline">
          <ChevronsUpDownIcon className="size-4" />
          <span className="hidden sm:inline">{modelLabel}</span>
        </Button>
        <Select onValueChange={onSetThinking} value={thinkingLevel}>
          <SelectTrigger aria-label="Thinking level" size="sm">
            <BrainIcon className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {THINKING_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {shouldSuggestCompaction && (
          <Button onClick={onCompactContext} size="sm" type="button" variant="secondary">
            Compact
          </Button>
        )}
        <Button
          aria-label="Open Changes"
          title={
            gitStatus?.isRepo
              ? `${gitStatus.branch || "Detached HEAD"}: ${gitStatus.hasChanges ? "Uncommitted changes" : "No changes"}`
              : "No git repository"
          }
          onClick={onOpenGitDiff}
          size="sm"
          type="button"
          variant="outline"
        >
          <GitCompareIcon className="size-4" />
          <span className="hidden max-w-24 truncate md:inline">{gitStatus?.branch || "Changes"}</span>
          {gitStatus?.hasChanges && (
            <span className="text-xs">
              +{gitStatus.additions} −{gitStatus.deletions}
            </span>
          )}
          {gitLoading && <span className="sr-only">Refreshing git status</span>}
        </Button>
        <Button aria-label="Settings" onClick={onOpenSettings} size="icon-sm" type="button" variant="ghost">
          <SettingsIcon className="size-4" />
        </Button>
        <Button aria-label="Commands" onClick={onOpenCommandPalette} size="icon-sm" type="button" variant="ghost">
          <CommandIcon className="size-4" />
        </Button>
        <Button
          aria-label={rightPanelOpen ? "Hide right panel" : "Show right panel"}
          aria-expanded={rightPanelOpen}
          onClick={onToggleRightPanel}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelRightIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}
