/**
 * The `<svg>` layer of the renderer (`#47`).
 *
 * Everything policy-shaped lives in `../svg-map.ts`; this file only creates React elements
 * from names that were already validated against the allowlist. DIL spells attributes the
 * way React does (`markerWidth`, `strokeWidth`, `textAnchor`), so no name translation is
 * needed — only namespaced ids and a sane default size.
 */

import { createElement, type ReactNode } from "react";
import type { ResolvedProps } from "../render-tree";
import { svgProps } from "../svg-map";

export interface SvgElementProps {
  readonly name: string;
  readonly props: ResolvedProps;
  /** `svgIdPrefix(key)` of the enclosing `<svg>`; ids and `url(#…)` are rewritten with it. */
  readonly idPrefix: string;
  readonly children: ReactNode;
}

export function SvgElement({ name, props, idPrefix, children }: SvgElementProps) {
  const attributes = svgProps(name, props, idPrefix);

  if (name !== "svg") return createElement(name, attributes, children);

  // A diagram without a width would collapse to zero in a flex column; `viewBox` still
  // controls the aspect ratio, so `100%` is the safe default.
  return createElement(
    name,
    { width: "100%", ...attributes, "data-dil-svg": "", className: "block max-w-full text-current" },
    children,
  );
}
