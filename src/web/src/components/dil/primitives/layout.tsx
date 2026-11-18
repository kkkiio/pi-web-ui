/**
 * Spatial primitives — the `#46` core of a DIL answer.
 *
 * `box` / `row` / `col` / `grid` / `grid-item` / `divider` carry no product meaning:
 * they are the handful of containers a model needs to lay a dense explanation out. All
 * token resolution happens in `../tokens.ts`; these components only choose the element
 * and keep the class list in one place.
 */

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What every primitive receives from the renderer. */
export interface PrimitiveProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

/** A bordered / padded surface: the default grouping primitive. */
export function Box({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

/** Horizontal layout. */
export function Row({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("flex flex-row min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

/** Vertical layout (the default block direction, made explicit). */
export function Col({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("flex flex-col min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

/** CSS grid; `columns` arrives pre-resolved as `gridTemplateColumns`. */
export function Grid({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("grid min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

/** One cell of a `grid`; `min-w-0` keeps long code lines from stretching the track. */
export function GridItem({ className, style, children }: PrimitiveProps) {
  return (
    <div className={cn("min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

/** A rule. `spacing` arrives as `marginBlock`. */
export function Divider({ className, style }: PrimitiveProps) {
  return <hr className={cn("border-0 border-t border-border", className)} style={style} />;
}
