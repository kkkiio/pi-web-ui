/**
 * The DIL tag vocabulary — one table for run membership, emphasis spanning, prompt copy and
 * renderer routing.
 *
 * Two independent questions, two flags:
 *
 *   kind     does it sit in a sentence?   (`kind: "inline"` joins a prose run; the compiler
 *            output shows `Cite` next to `code` inside `<text>`, so that is a property of the
 *            component, not of the line it was written on)
 *   source   may the model write it?       corpus + the prompt
 *   lowered  does our lowering emit it?    Markdown → `title`/`list`/`table`/`bold`/…
 *
 * Every tag is at least tolerated (the parser keeps unknown tags, the renderer falls back),
 * so the flags describe where a tag *comes from*, not whether it is legal:
 *
 *   source only    e.g. `box` `row` `icon` `badge` `Cite` `CodeBlock`
 *   lowered only   e.g. `bold` `italic` `code` `math` `table*` `blockquote` `code-block`
 *   both           e.g. `text` `title` `list` `list-item` `divider` `Link`
 *   neither        `__chatgptClientDefinedWidget` (ChatGPT's compiler output)
 */

/** Whether a tag belongs to the prose flow or stands on its own. */
export type TagKind = "container" | "inline";

/**
 * `rendered`  a component in `src/web/src/components/dil`
 * `fallback`  understood by the parser, rendered as `FallbackInline` / `FallbackBlock`
 * `internal`  produced by the ChatGPT compiler, never written by a model
 */
export type TagSupport = "rendered" | "fallback" | "internal";

export interface TagEntry {
  readonly kind: TagKind;
  readonly support: TagSupport;
  /** The model may write it: observed in the corpus, or taught by the prompt. */
  readonly source?: true;
  /** Our lowering emits it: a Markdown construct or a fence becomes this tag. */
  readonly lowered?: true;
  /** Also a primitive when it appears inside `<svg>` (see `svg-map.ts`). */
  readonly svg?: true;
  readonly note?: string;
}

export const DIL_VOCABULARY = {
  // Layout — written by the model, never produced by Markdown.
  box: { kind: "container", support: "rendered", source: true },
  row: { kind: "container", support: "rendered", source: true },
  col: { kind: "container", support: "rendered", source: true },
  grid: { kind: "container", support: "rendered", source: true },
  "grid-item": { kind: "container", support: "rendered", source: true },

  // Typography. A Markdown block lowers to `title`/`text`/`divider`; the model also writes
  // `<text>` directly (209 in the corpus), so both flags apply.
  title: { kind: "container", support: "rendered", source: true, lowered: true },
  text: {
    kind: "container",
    support: "rendered",
    source: true,
    lowered: true,
    svg: true,
    note: "SVG text inside `<svg>`",
  },
  caption: { kind: "container", support: "rendered", source: true },
  divider: { kind: "container", support: "rendered", source: true, lowered: true },
  blockquote: { kind: "container", support: "rendered", lowered: true },

  // Inline atoms — the ones a sentence may contain. `bold`/`italic`/`code`/`math` are
  // Markdown's own syntax (`**x**`, `` `x` ``, `$x$`) lowered to tags; the model writes none
  // of them, so they are lowered-only.
  bold: { kind: "inline", support: "rendered", lowered: true },
  italic: { kind: "inline", support: "rendered", lowered: true },
  code: { kind: "inline", support: "rendered", lowered: true },
  math: { kind: "inline", support: "rendered", lowered: true, note: "`block` attribute for display math" },
  badge: { kind: "inline", support: "rendered", source: true },
  icon: { kind: "inline", support: "rendered", source: true },
  Link: { kind: "inline", support: "rendered", source: true, lowered: true },

  // Code leaves. A fence is Markdown in the source; our lowering represents it as
  // `code-block`, which no model writes. ChatGPT compiles a fence to its client widget.
  "code-block": { kind: "container", support: "rendered", lowered: true, note: "our fence target" },

  // Lists and tables: Markdown lowers here, and the model occasionally writes the tags.
  list: { kind: "container", support: "rendered", source: true, lowered: true },
  "list-item": { kind: "container", support: "rendered", source: true, lowered: true },
  table: { kind: "container", support: "rendered", lowered: true },
  "table-row": { kind: "container", support: "rendered", lowered: true },
  "table-cell": { kind: "container", support: "rendered", lowered: true },

  // Interactive controls (`#48` — written by the model, renderer pending).
  button: { kind: "container", support: "fallback", source: true },
  "radio-group": { kind: "container", support: "fallback", source: true },
  radio: { kind: "container", support: "fallback", source: true },
  label: { kind: "container", support: "fallback", source: true },
  textarea: { kind: "container", support: "fallback", source: true },

  // SVG (`#47`). Every one of these is in `svg-map.ts`'s allowlist.
  svg: { kind: "container", support: "rendered", source: true },
  defs: { kind: "container", support: "rendered", source: true, svg: true },
  marker: { kind: "container", support: "rendered", source: true, svg: true },
  g: { kind: "container", support: "rendered", source: true, svg: true },
  rect: { kind: "container", support: "rendered", source: true, svg: true },
  path: { kind: "container", support: "rendered", source: true, svg: true },
  line: { kind: "container", support: "rendered", source: true, svg: true },
  circle: { kind: "container", support: "rendered", source: true, svg: true },
  ellipse: { kind: "container", support: "rendered", source: true, svg: true },
  polygon: { kind: "container", support: "rendered", source: true, svg: true },
  polyline: { kind: "container", support: "rendered", source: true, svg: true },

  // Host-resolved components: resolved server-side and embedded in a sentence.
  Cite: { kind: "inline", support: "fallback", source: true },
  Entity: { kind: "inline", support: "fallback", source: true },
  AsyncImage: { kind: "inline", support: "fallback", source: true },
  AsyncImageGroup: { kind: "inline", support: "fallback", source: true },

  // Written by the model (18x in the corpus) with a raw code body; ChatGPT compiles it to
  // its client widget, we render it as a code block. `editable` is dropped (#56).
  CodeBlock: { kind: "container", support: "rendered", source: true },

  // ChatGPT's compiler output; never in our source, never lowered by us.
  __chatgptClientDefinedWidget: { kind: "container", support: "internal" },
} as const satisfies Record<string, TagEntry>;

export type DilTagName = keyof typeof DIL_VOCABULARY;

/** Tags that may sit in the middle of a sentence: they join a prose run. */
export const INLINE_TAGS: ReadonlySet<string> = new Set(
  Object.entries(DIL_VOCABULARY)
    .filter(([, entry]) => entry.kind === "inline")
    .map(([name]) => name),
);

/** Every tag the vocabulary knows, for diagnostics and tests. */
export const KNOWN_TAGS: readonly string[] = Object.keys(DIL_VOCABULARY);

export function tagEntry(name: string): TagEntry | undefined {
  return (DIL_VOCABULARY as Record<string, TagEntry>)[name];
}

/** Unknown tags are treated as containers: they keep their position and render a fallback. */
export function isInlineTag(name: string): boolean {
  return INLINE_TAGS.has(name);
}

export function isKnownTag(name: string): boolean {
  return name in DIL_VOCABULARY;
}
