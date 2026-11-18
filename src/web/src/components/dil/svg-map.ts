/**
 * SVG primitives for DIL (`#47`).
 *
 * The parser already keeps `<svg>` subtrees intact — camelCase attribute names, expression
 * attributes (`x={30 + c * 32}`) and nested `{#each}` all arrive as-is — so this module is
 * the whole policy layer: which tags exist, which attributes each tag may carry, and how an
 * id reference is rewritten.
 *
 * Two rules make it safe to hand model output to React:
 *
 *   1. **An allowlist per tag.** Anything else is dropped, including every `on*` handler,
 *      `href`/`xlink:href` (external loads), `class`/`style` (arbitrary CSS) and
 *      `dangerouslySetInnerHTML`.
 *   2. **Ids are namespaced.** The same diagram appears in many messages, each writing
 *      `<marker id="arrow">`; without a prefix every `markerEnd="url(#arrow)"` in the
 *      transcript would resolve to the first one.
 *
 * Pure TypeScript, no React import, so it is unit-tested in Node (`svg-map.test.ts`).
 */

const PAINT = [
  "opacity",
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeWidth",
  "strokeDasharray",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeOpacity",
] as const;

const MARKERS = ["markerEnd", "markerStart", "markerMid"] as const;

/** Every tag DIL renders inside `<svg>`. A name outside this set is dropped. */
const SVG_ATTRIBUTES: Record<string, readonly string[]> = {
  svg: ["viewBox", "width", "height", "preserveAspectRatio"],
  defs: [],
  marker: ["id", "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits", "viewBox"],
  g: ["transform", ...PAINT],
  rect: ["x", "y", "width", "height", "rx", "ry", ...PAINT],
  path: ["d", ...PAINT, ...MARKERS],
  line: ["x1", "y1", "x2", "y2", ...PAINT, ...MARKERS],
  circle: ["cx", "cy", "r", ...PAINT],
  ellipse: ["cx", "cy", "rx", "ry", ...PAINT],
  polygon: ["points", ...PAINT, ...MARKERS],
  polyline: ["points", ...PAINT, ...MARKERS],
  text: [
    "x",
    "y",
    "dx",
    "dy",
    "fontSize",
    "fontWeight",
    "fontFamily",
    "textAnchor",
    "dominantBaseline",
    "letterSpacing",
    "transform",
    ...PAINT,
  ],
};

export type SvgTag = keyof typeof SVG_ATTRIBUTES;

export function isSvgTag(name: string): name is SvgTag {
  return Object.hasOwn(SVG_ATTRIBUTES, name);
}

/**
 * A per-`<svg>` id namespace derived from the render key, e.g. `n.2.1` → `dil-n-2-1`.
 * Deterministic, so a re-render keeps the same ids and React does not remount markers.
 */
export function svgIdPrefix(key: string): string {
  return `dil-${key.replace(/[^\w-]+/g, "-")}`;
}

export type SvgProps = Record<string, string | number>;

/**
 * Filter, sanitize and namespace one element's attributes. Unknown attributes are dropped
 * silently: a diagram losing an unsupported hint still reads, while a diagnostic storm in
 * the middle of a stream would not.
 */
export function svgProps(name: string, props: Readonly<Record<string, unknown>>, idPrefix: string): SvgProps {
  const allowed = SVG_ATTRIBUTES[name];
  if (!allowed) return {};

  const out: SvgProps = {};
  for (const [attribute, value] of Object.entries(props)) {
    if (!allowed.includes(attribute)) continue;
    if (attribute === "id") {
      const id = idValue(value);
      if (id) out.id = `${idPrefix}-${id}`;
      continue;
    }
    const safe = svgValue(value, idPrefix);
    if (safe !== undefined) out[attribute] = safe;
  }
  return out;
}

function idValue(value: unknown): string | undefined {
  return typeof value === "string" && /^[\w-]+$/.test(value) ? value : undefined;
}

const UNSAFE = /(?:javascript|vbscript|expression\s*\(|data:text\/html|<)/i;

/**
 * Numbers pass through (React writes them as attributes), strings are kept unless they
 * smuggle a script URL. `url(…)` may only name a same-document id, and that id is rewritten
 * into this diagram's namespace.
 */
export function svgValue(value: unknown, idPrefix: string): string | number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  const text = value.trim();
  if (!text || UNSAFE.test(text)) return undefined;

  const reference = /^url\(\s*['"]?#([\w-]+)['"]?\s*\)$/.exec(text);
  if (reference) return `url(#${idPrefix}-${reference[1]})`;
  if (/url\s*\(/i.test(text)) return undefined;

  return text;
}
