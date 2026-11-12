import { DatabaseIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { formatCompactTokens } from "../../core/format";
import { usePiWebUiStore } from "../../core/store";
import type { UsageTotals } from "../../core/types";
import { ContextPopover } from "./context-popover";

const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Exact token counts keep digit grouping so the reading panel matches the Pi footer's whole numbers. */
function exactTokens(value: number) {
  return value.toLocaleString("en-US");
}

export function ComposerStats() {
  const usageTotals = usePiWebUiStore((state) => state.usageTotals);
  const contextUsage = usePiWebUiStore((state) => state.contextUsage);
  const contextWindowSize = usePiWebUiStore((state) => state.contextWindowSize);
  const lastUsage = usePiWebUiStore((state) => state.lastUsage);
  const [open, setOpen] = useState<"usage" | "context" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const total = usageTotals.input + usageTotals.cacheRead + usageTotals.cacheWrite + usageTotals.output;
  // Cache hit follows the Pi footer: the latest request only, not the session-wide share.
  const lastPromptTokens = (lastUsage?.input || 0) + (lastUsage?.cacheRead || 0) + (lastUsage?.cacheWrite || 0);
  const cacheHit = lastPromptTokens > 0 ? ((lastUsage?.cacheRead || 0) / lastPromptTokens) * 100 : null;

  const windowSize = contextUsage?.contextWindow || contextWindowSize;
  const fallbackPercent =
    windowSize > 0
      ? (((lastUsage?.input || 0) + (lastUsage?.cacheRead || 0) + (lastUsage?.cacheWrite || 0)) / windowSize) * 100
      : null;
  const percent = contextUsage ? contextUsage.percent : fallbackPercent;
  const ringPercent = Math.max(0, Math.min(100, percent ?? 0));

  if (total === 0 && percent === null) return null;

  const pillClass = "inline-flex items-center gap-1.5 rounded px-2 py-px hover:bg-muted hover:text-foreground";

  return (
    <div
      className="relative flex flex-wrap items-center justify-center gap-x-3 pt-1 text-[12px] text-muted-foreground tabular-nums"
      ref={rootRef}
    >
      {total > 0 && (
        <span className="inline-flex">
          <button
            aria-expanded={open === "usage"}
            aria-haspopup="dialog"
            aria-label={`Token usage ${formatCompactTokens(total)} tokens`}
            className={cn(pillClass, open === "usage" && "bg-muted text-foreground")}
            onClick={() => setOpen(open === "usage" ? null : "usage")}
            type="button"
          >
            <DatabaseIcon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{formatCompactTokens(total)} tok</span>
            {cacheHit !== null && (
              <>
                <span className="hidden opacity-40 sm:inline">·</span>
                <span>Cache hit {cacheHit.toFixed(1)}%</span>
              </>
            )}
          </button>
        </span>
      )}

      {percent !== null && (
        <span className="inline-flex">
          <button
            aria-expanded={open === "context"}
            aria-haspopup="dialog"
            aria-label={`Context used ${percent.toFixed(1)}%`}
            className={cn(pillClass, open === "context" && "bg-muted text-foreground")}
            onClick={() => setOpen(open === "context" ? null : "context")}
            type="button"
          >
            <svg className="-rotate-90" height={14} viewBox="0 0 14 14" width={14}>
              <title>Context used</title>
              <circle
                className="stroke-muted-foreground/25"
                cx={7}
                cy={7}
                fill="none"
                r={RING_RADIUS}
                strokeWidth={2}
              />
              <circle
                className="stroke-primary"
                cx={7}
                cy={7}
                fill="none"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringPercent / 100)}
                strokeLinecap="round"
                strokeWidth={2}
              />
            </svg>
            <span>{percent.toFixed(1)}%</span>
          </button>
        </span>
      )}

      {open === "usage" && total > 0 && <UsagePanel cacheHit={cacheHit} total={total} usageTotals={usageTotals} />}
      {open === "context" && percent !== null && (
        <ContextPopover
          className="absolute bottom-full left-1/2 z-20 mb-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2"
          contextWindowSize={windowSize}
          lastUsage={lastUsage}
          onClose={() => setOpen(null)}
          usedTokens={contextUsage?.tokens ?? null}
        />
      )}
    </div>
  );
}

function UsagePanel({
  cacheHit,
  total,
  usageTotals,
}: {
  cacheHit: number | null;
  total: number;
  usageTotals: UsageTotals;
}) {
  const rows = [
    { label: "未缓存输入", value: usageTotals.input },
    { label: "缓存读", value: usageTotals.cacheRead },
    ...(usageTotals.cacheWrite > 0 ? [{ label: "缓存写", value: usageTotals.cacheWrite }] : []),
    { label: "输出", value: usageTotals.output },
    ...(cacheHit !== null ? [{ label: "缓存命中率", text: `${cacheHit.toFixed(1)}%` }] : []),
    ...(usageTotals.cost > 0 ? [{ label: "成本", text: `$${usageTotals.cost.toFixed(3)}` }] : []),
  ];

  return (
    <div
      aria-label="Token usage"
      className="absolute bottom-full left-1/2 z-20 mb-2 w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      role="dialog"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <DatabaseIcon className="size-3.5" />
          Token 用量
        </span>
        <span className="text-muted-foreground tabular-nums">{formatCompactTokens(total)} tok</span>
      </div>
      <div className="my-2 h-px bg-border" />
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right tabular-nums">{"text" in row ? row.text : exactTokens(row.value)}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
