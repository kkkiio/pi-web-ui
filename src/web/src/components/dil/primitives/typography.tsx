/**
 * Typography primitives — the inline vocabulary a DIL answer is written in.
 *
 * `bold` / `italic` / `code` are the lowers of `**…**`, `*…*` and `` `…` ``, so they are
 * inline elements; `title` / `text` / `caption` are block-ish flow elements; `badge` and
 * `icon` are the two small decorations the corpus uses most (197 `icon` call sites in the
 * sampled messages).
 *
 * The icon registry is imported as a whole (`lucide-react`'s `icons`), which keeps the
 * model free to name any icon; an unknown name falls back to a neutral dot instead of
 * throwing mid-transcript.
 */

import { Circle, icons } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { iconComponentName } from "../tokens";

export interface PrimitiveProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

export function Title({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("font-semibold tracking-tight text-foreground", className)} style={style}>
      {children}
    </div>
  );
}

export function Text({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("min-w-0 text-foreground", className)} style={style}>
      {children}
    </div>
  );
}

export function Caption({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("text-xs leading-5 text-muted-foreground", className)} style={style}>
      {children}
    </div>
  );
}

export function Badge({ className, style, children }: PrimitiveProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted px-2 py-0.5 font-medium",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export function Bold({ className, children }: PrimitiveProps) {
  return <strong className={cn("font-semibold", className)}>{children}</strong>;
}

export function Italic({ className, children }: PrimitiveProps) {
  return <em className={cn("italic", className)}>{children}</em>;
}

export function InlineCode({ className, style, children }: PrimitiveProps) {
  return (
    <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]", className)} style={style}>
      {children}
    </code>
  );
}

export interface IconProps extends PrimitiveProps {
  /** DIL icon name, e.g. `arrow-down`, `github`, `check-circle`. */
  readonly name?: unknown;
  /** Accessible label; icons are decorative when absent. */
  readonly label?: string;
}

export function Icon({ className, style, name, label }: IconProps) {
  const componentName = iconComponentName(name);
  const Glyph =
    (componentName ? (icons as Record<string, typeof Circle | undefined>)[componentName] : undefined) ?? Circle;
  const decorative = !label;
  return (
    <Glyph
      aria-hidden={decorative || undefined}
      aria-label={label}
      className={cn("size-4 shrink-0", className)}
      style={style}
      role={decorative ? undefined : "img"}
    />
  );
}
