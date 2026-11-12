import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatTokens } from "../../core/format";
import type { Usage } from "../../core/types";

export function ContextPopover({
  className,
  contextWindowSize,
  lastUsage,
  onClose,
  usedTokens,
}: {
  className?: string;
  contextWindowSize: number;
  lastUsage: Usage | null;
  onClose: () => void;
  /** Provider-reported occupancy; falls back to the last prompt when absent. */
  usedTokens?: number | null;
}) {
  const input = lastUsage?.input || 0;
  const cacheRead = lastUsage?.cacheRead || 0;
  const cacheWrite = lastUsage?.cacheWrite || 0;
  // Every prompt token is billed into one of the three buckets, so all three count as occupied.
  const totalUsed = Math.max(0, usedTokens ?? input + cacheRead + cacheWrite);
  const available = Math.max(0, contextWindowSize - totalUsed);
  const segments = [
    { label: "Cached", value: cacheRead, className: "bg-sky-500" },
    { label: "Input", value: input, className: "bg-amber-500" },
    ...(cacheWrite > 0 ? [{ label: "Cache write", value: cacheWrite, className: "bg-violet-500" }] : []),
    { label: "Available", value: available, className: "bg-muted" },
  ];
  const percent = contextWindowSize ? Math.round((totalUsed / contextWindowSize) * 100) : 0;

  return (
    <div className={cn("w-80 rounded-lg border bg-popover p-4 shadow-lg", className ?? "absolute right-4 top-4 z-20")}>
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium text-sm">Context Window</div>
        <Button onClick={onClose} size="icon-sm" type="button" variant="ghost">
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            className={segment.className}
            key={segment.label}
            style={{
              width: `${Math.max(0, (segment.value / contextWindowSize) * 100)}%`,
            }}
          />
        ))}
      </div>
      <div className="space-y-1 text-sm">
        {segments.map((segment) => (
          <div className="flex justify-between" key={segment.label}>
            <span className="text-muted-foreground">{segment.label}</span>
            <span>{formatTokens(segment.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t pt-3 text-muted-foreground text-xs">
        <span>{percent}% used</span>
        <span>
          {formatTokens(totalUsed)} / {formatTokens(contextWindowSize)}
        </span>
      </div>
    </div>
  );
}
