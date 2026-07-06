import { FileTextIcon, GitBranchIcon, GitCompareIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatTime } from "../../core/format";
import type { GitStatusResult, WorkspaceArtifact } from "../../core/types";

export function WorkspaceStatusFloat({
  artifacts,
  gitLoading,
  gitStatus,
  onOpenArtifact,
  onOpenGitDiff,
}: {
  artifacts: WorkspaceArtifact[];
  gitLoading: boolean;
  gitStatus: GitStatusResult | null;
  onOpenArtifact: (artifact: WorkspaceArtifact) => void;
  onOpenGitDiff: () => void;
}) {
  const canOpenGitDiff = Boolean(gitStatus?.isRepo);
  const recentArtifacts = artifacts.slice(0, 5);

  return (
    <>
      <div
        className="absolute right-4 top-4 z-20 hidden w-80 rounded-lg border bg-popover/95 p-4 shadow-lg backdrop-blur md:block"
        data-testid="workspace-status-float"
      >
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">Workspace</div>
            {gitLoading && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
              canOpenGitDiff ? "hover:bg-muted" : "cursor-default",
            )}
            data-testid="workspace-git-row"
            disabled={!canOpenGitDiff}
            onClick={onOpenGitDiff}
            type="button"
          >
            <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{gitBranchLabel(gitStatus, gitLoading)}</div>
              <div className="truncate text-muted-foreground text-xs">{gitDetailLabel(gitStatus, gitLoading)}</div>
            </div>
            {gitStatus?.isRepo && gitStatus.hasChanges && (
              <div className="shrink-0 font-medium text-xs">
                <span className="text-emerald-600">+{gitStatus.additions}</span>{" "}
                <span className="text-destructive">-{gitStatus.deletions}</span>
              </div>
            )}
          </button>
        </section>

        <section className="mt-4 space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-sm">Artifacts</div>
            {artifacts.length > 0 && <div className="text-muted-foreground text-xs">{artifacts.length}</div>}
          </div>
          {recentArtifacts.length === 0 ? (
            <div className="px-2 py-1.5 text-muted-foreground text-sm">No artifacts yet</div>
          ) : (
            <div className="space-y-1">
              {recentArtifacts.map((artifact) => (
                <ArtifactRow artifact={artifact} key={artifact.path} onOpen={() => onOpenArtifact(artifact)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Button
        aria-label="Open workspace status"
        className="fixed right-3 bottom-36 z-30 shadow-lg md:hidden"
        disabled={!canOpenGitDiff && recentArtifacts.length === 0}
        onClick={() => (canOpenGitDiff ? onOpenGitDiff() : recentArtifacts[0] && onOpenArtifact(recentArtifacts[0]))}
        size="icon-sm"
        title="Workspace status"
        type="button"
        variant="outline"
      >
        <GitCompareIcon className="size-4" />
      </Button>
    </>
  );
}

function ArtifactRow({ artifact, onOpen }: { artifact: WorkspaceArtifact; onOpen: () => void }) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
      data-testid="workspace-artifact-row"
      onClick={onOpen}
      type="button"
    >
      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{artifact.name}</div>
        <div className="truncate text-muted-foreground text-xs">{artifact.directory}</div>
      </div>
      <div className="shrink-0 text-muted-foreground text-xs">
        {artifact.tool} · {formatTime(new Date(artifact.updatedAt).toISOString())}
      </div>
    </button>
  );
}

function gitBranchLabel(gitStatus: GitStatusResult | null, loading: boolean): string {
  if (loading && !gitStatus) return "Loading git status";
  if (!gitStatus) return "Git status unavailable";
  if (!gitStatus.isRepo) return "No git repository";
  return gitStatus.branch || "Detached HEAD";
}

function gitDetailLabel(gitStatus: GitStatusResult | null, loading: boolean): string {
  if (loading && !gitStatus) return "Checking workspace";
  if (!gitStatus) return "Connect to Pi to load status";
  if (!gitStatus.isRepo) return "Open a git workspace to view changes";
  if (!gitStatus.hasChanges) return "No changes";
  if (gitStatus.untracked) return `${gitStatus.untracked} untracked file${gitStatus.untracked === 1 ? "" : "s"}`;
  return "Changes";
}
