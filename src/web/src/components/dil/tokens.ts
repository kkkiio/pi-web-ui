/**
 * DIL design tokens → Pi Web UI classes.
 *
 * The grammar carries layout intent, not CSS: `gap={2}`, `padding={{x: 3, y: 2}}`,
 * `background="surface-secondary"`, `border={{size: 1, color: "success"}}`. This module
 * is the only place that knows what those names mean, which keeps every primitive dumb
 * and makes the mapping testable in Node (no React, no DOM).
 *
 * Two outlets:
 *
 *   className  semantic colours, radii, typography — Tailwind's theme tokens, so light
 *              and dark follow the app.
 *   style      numeric geometry (spacing on the 4px scale), percentages, and literal
 *              colours such as `#168578` or `rgba(…)` that the model wrote inline.
 *
 * Everything that reaches `style` is validated: a value that is not a number, a CSS
 * length or a plain colour is ignored rather than forwarded.
 */

import type { CSSProperties } from "react";

/** What a primitive needs to render a DIL node. */
export interface Skin {
  readonly className: string;
  readonly style: CSSProperties;
}

export type SkinProps = Readonly<Record<string, unknown>>;

const EMPTY: Skin = { className: "", style: {} };

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

/** DIL spacing units are the Tailwind scale: 1 = 0.25rem. */
function rem(units: number): string {
  return `${units * 0.25}rem`;
}

const LENGTH = /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ch|pt)$/;

/** A CSS length DIL may write (`11px`, `100%`, `1.5rem`) or a bare number of px. */
function readLength(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "auto" || trimmed === "fit-content") return trimmed;
  return LENGTH.test(trimmed) ? trimmed : undefined;
}

const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([\d\s.,%/+a-z-]*\)$/i;
const HEX = /^#[\da-f]{3,8}$/i;

/** A literal colour the model wrote inline. Anything else never reaches the DOM. */
function readColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (HEX.test(trimmed) || COLOR_FUNCTION.test(trimmed)) return trimmed;
  return undefined;
}

function merge(base: Skin, extra: { className?: string; style?: CSSProperties }): Skin {
  const className = [base.className, extra.className ?? ""].filter(Boolean).join(" ");
  const style = { ...base.style, ...(extra.style ?? {}) };
  return { className, style };
}

// ---------------------------------------------------------------------------
// Shared container tokens
// ---------------------------------------------------------------------------

const RADIUS: Record<string, string> = {
  none: "rounded-none",
  xs: "rounded-sm",
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
  full: "rounded-full",
};

const BACKGROUND: Record<string, string> = {
  default: "bg-card",
  surface: "bg-background",
  "surface-secondary": "bg-secondary",
  "surface-tertiary": "bg-muted",
  card: "bg-card",
  muted: "bg-muted",
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  danger: "bg-destructive/10",
  destructive: "bg-destructive/10",
  info: "bg-sky-500/10",
};

const BORDER_COLOR: Record<string, string> = {
  default: "border-border",
  muted: "border-border",
  success: "border-emerald-500/40",
  warning: "border-amber-500/40",
  danger: "border-destructive/40",
  destructive: "border-destructive/40",
  info: "border-sky-500/40",
  primary: "border-primary",
};

const BORDER_WIDTH: Record<number, string> = { 1: "border", 2: "border-2", 4: "border-4", 8: "border-8" };

const BORDER_STYLE: Record<string, string> = {
  solid: "border-solid",
  dashed: "border-dashed",
  dotted: "border-dotted",
};

function backgroundSkin(value: unknown): Skin {
  if (value === undefined || value === null || value === "") return EMPTY;
  if (typeof value === "string") {
    const named = BACKGROUND[value];
    if (named) return { className: named, style: {} };
  }
  const literal = readColor(value);
  return literal ? { className: "", style: { backgroundColor: literal } } : EMPTY;
}

function borderSkin(value: unknown): Skin {
  if (value === undefined || value === null || value === false) return EMPTY;
  if (value === true) return { className: "border border-border", style: {} };

  const props = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const size = readNumber(props.size) ?? 1;
  const width = BORDER_WIDTH[size] ?? "border";
  const style = BORDER_STYLE[String(props.style ?? "solid")] ?? "";
  const color = typeof props.color === "string" ? props.color : "default";
  const named = BORDER_COLOR[color];
  if (named) return { className: [width, named, style].filter(Boolean).join(" "), style: {} };

  const literal = readColor(props.color);
  if (!literal) return { className: [width, "border-border", style].filter(Boolean).join(" "), style: {} };
  return {
    className: [width, style].filter(Boolean).join(" "),
    style: { borderColor: literal },
  };
}

function paddingStyle(value: unknown): CSSProperties {
  const uniform = readNumber(value);
  if (uniform !== undefined) return { padding: rem(uniform) };

  if (typeof value !== "object" || value === null) return EMPTY.style;
  const props = value as Record<string, unknown>;
  const x = readNumber(props.x);
  const y = readNumber(props.y);
  if (x !== undefined || y !== undefined) {
    return {
      ...(x !== undefined ? { paddingInline: rem(x) } : {}),
      ...(y !== undefined ? { paddingBlock: rem(y) } : {}),
    };
  }
  const sides: CSSProperties = {};
  for (const [key, css] of [
    ["top", "paddingTop"],
    ["right", "paddingRight"],
    ["bottom", "paddingBottom"],
    ["left", "paddingLeft"],
  ] as const) {
    const amount = readNumber(props[key]);
    if (amount !== undefined) sides[css] = rem(amount);
  }
  return sides;
}

function gapStyle(value: unknown): CSSProperties {
  const units = readNumber(value);
  if (units !== undefined) return { gap: rem(units) };
  const length = readLength(value);
  return length ? { gap: length } : {};
}

function sizeStyle(props: SkinProps): CSSProperties {
  const style: CSSProperties = {};
  const width = readLength(props.width);
  const height = readLength(props.height);
  const minHeight = readLength(props.minHeight);
  const maxWidth = readLength(props.maxWidth);
  if (width) style.width = width;
  if (height) style.height = height;
  if (minHeight) style.minHeight = minHeight;
  if (maxWidth) style.maxWidth = maxWidth;
  const flex = readNumber(props.flex) ?? (props.flex === "auto" ? "auto" : undefined);
  if (flex !== undefined) style.flex = String(flex);
  return style;
}

const ALIGN: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
  stretch: "items-stretch",
};

const JUSTIFY: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

const DIRECTION: Record<string, string> = { row: "flex-row", col: "flex-col", column: "flex-col" };

function containerSkin(props: SkinProps, base: string): Skin {
  const radius = typeof props.radius === "string" ? RADIUS[props.radius] : undefined;
  const classes = [
    base,
    radius ?? "",
    typeof props.align === "string" ? (ALIGN[props.align] ?? "") : "",
    typeof props.justify === "string" ? (JUSTIFY[props.justify] ?? "") : "",
    typeof props.direction === "string" ? (DIRECTION[props.direction] ?? "") : "",
    readBoolean(props.wrap) ? "flex-wrap" : "",
    readBoolean(props.clip) ? "overflow-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const skin = merge(
    { className: classes, style: {} },
    { style: { ...paddingStyle(props.padding), ...gapStyle(props.gap), ...sizeStyle(props) } },
  );
  return merge(skin, backgroundSkin(props.background));
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function layoutSkin(name: string, props: SkinProps): Skin {
  switch (name) {
    case "box": {
      // A `gap` (or an explicit alignment) only means something in a stack, so `box`
      // becomes a column when the model asked for one, and stays a plain block otherwise.
      const stacking = props.gap !== undefined || props.justify !== undefined || props.align !== undefined;
      let skin = containerSkin(props, stacking ? "flex flex-col min-w-0" : "min-w-0");
      skin = merge(skin, borderSkin(props.border));
      return skin;
    }
    case "row":
      return containerSkin(props, "flex flex-row min-w-0");
    case "col":
      return containerSkin(props, "flex flex-col min-w-0");
    case "grid": {
      const skin = containerSkin(props, "grid min-w-0");
      const columns = readNumber(props.columns);
      if (columns !== undefined && columns > 0 && columns <= 12) {
        return merge(skin, { style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } });
      }
      if (props.columns === "auto") {
        return merge(skin, { style: { gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" } });
      }
      return skin;
    }
    case "grid-item":
      return { className: "min-w-0", style: sizeStyle(props) };
    case "divider": {
      const spacing = readNumber(props.spacing);
      const literal = readColor(props.color);
      return {
        className: "border-0 border-t border-border",
        style: {
          ...(spacing !== undefined ? { marginBlock: rem(spacing) } : {}),
          ...(literal ? { borderColor: literal } : {}),
        },
      };
    }
    default:
      return { className: "min-w-0", style: paddingStyle(props.padding) };
  }
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const FONT_SIZE: Record<string, string> = {
  "3xs": "text-[0.625rem] leading-4",
  "2xs": "text-[0.6875rem] leading-4",
  xs: "text-xs leading-5",
  sm: "text-sm leading-6",
  md: "text-base leading-7",
  lg: "text-lg leading-7",
  xl: "text-xl leading-8",
  "2xl": "text-2xl leading-9",
  "3xl": "text-3xl leading-10",
};

const FONT_WEIGHT: Record<string, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const TEXT_ALIGN: Record<string, string> = {
  left: "text-left",
  start: "text-left",
  center: "text-center",
  right: "text-right",
  end: "text-right",
  justify: "text-justify",
};

const TEXT_COLOR: Record<string, string> = {
  default: "text-foreground",
  primary: "text-foreground",
  secondary: "text-muted-foreground",
  muted: "text-muted-foreground",
  accent: "text-accent-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
  destructive: "text-destructive",
  info: "text-sky-600 dark:text-sky-400",
};

function textSkinOf(props: SkinProps, base: string): Skin {
  const size = typeof props.size === "string" ? (FONT_SIZE[props.size] ?? undefined) : undefined;
  const literalSize = FONT_SIZE[String(props.size)] ? undefined : readLength(props.size);
  const weight = typeof props.weight === "string" ? (FONT_WEIGHT[props.weight] ?? "") : "";
  const align = typeof props.textAlign === "string" ? (TEXT_ALIGN[props.textAlign] ?? "") : "";
  const namedColor = typeof props.color === "string" ? TEXT_COLOR[props.color] : undefined;
  const literalColor = namedColor ? undefined : readColor(props.color);

  const classes = [
    base,
    size ?? "",
    weight,
    align,
    namedColor ?? "",
    readBoolean(props.tabularNums) ? "tabular-nums" : "",
    readBoolean(props.lineThrough) ? "line-through" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {};
  if (literalSize) style.fontSize = literalSize;
  if (literalColor) style.color = literalColor;

  return merge({ className: classes, style }, { style: sizeStyle(props) });
}

export function textSkin(name: string, props: SkinProps): Skin {
  switch (name) {
    case "title":
      return textSkinOf(props, "font-semibold tracking-tight text-foreground");
    case "caption":
      return textSkinOf(props, "text-xs leading-5 text-muted-foreground");
    case "badge":
      return textSkinOf(
        { ...props, size: props.size ?? "xs" },
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted px-2 py-0.5 font-medium",
      );
    case "code":
      return textSkinOf(props, "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]");
    case "icon": {
      const literalColor = readColor(props.color);
      const named = typeof props.color === "string" ? TEXT_COLOR[props.color] : undefined;
      const size = ICON_SIZE[String(props.size)] ?? "size-4";
      return {
        className: [size, named ?? ""].filter(Boolean).join(" "),
        style: literalColor ? { color: literalColor } : {},
      };
    }
    default:
      return textSkinOf(props, "min-w-0 text-foreground");
  }
}

const ICON_SIZE: Record<string, string> = {
  "3xs": "size-2.5",
  "2xs": "size-3",
  xs: "size-3.5",
  sm: "size-4",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
  "2xl": "size-8",
};

/** `arrow-down` / `ArrowDown` → the PascalCase name lucide's registry uses. */
export function iconComponentName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const pascal = value
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Z][A-Za-z0-9]*$/.test(pascal) ? pascal : null;
}

/** Links may only navigate somewhere a reader can inspect: http(s) and mailto. */
export function safeLinkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return /^(?:https?:\/\/|mailto:)[^\s]+$/i.test(url) ? url : undefined;
}
