/**
 * The DIL tag vocabulary — one table for run membership, emphasis spanning, prompt copy and
 * renderer routing.
 *
 * `kind` is what ChatGPT's compiler knows about a component, not a guess from source layout:
 * in `dil/*.formatted.js`, `Cite` sits next to `code` inside a `<text>`, so it is an inline
 * atom wherever the model puts it.
 *
 * Evidence:
 *   observed  in `dil/*.source.md` and `*.formatted.js` — 37 tags, including the inline
 *             `Cite`/`Entity`/`AsyncImage*` that `dil.ebnf` §7.3 (our own transcription)
 *             does not list.
 *   ours      no corpus evidence: `code-block`/`pre` (ChatGPT hands fenced code to
 *             `__chatgptClientDefinedWidget`), and the SVG names `svg-map.ts` renders beyond
 *             what the samples used (`g`/`circle`/`ellipse`/`polygon`/`polyline`).
 *
 * Consumers: `INLINE_TAGS` (parser), `support` (the prompt lists only `rendered`), `svg` (also
 * a primitive inside `<svg>`; `text` is both).
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
  /** Also a primitive when it appears inside `<svg>` (see `svg-map.ts`). */
  readonly svg?: true;
  readonly note?: string;
}

export const DIL_VOCABULARY = {
  // Layout — the prompt's `<box>`/`<row>`/`<col>`/`<grid>` family.
  box: { kind: "container", support: "rendered" },
  row: { kind: "container", support: "rendered" },
  col: { kind: "container", support: "rendered" },
  grid: { kind: "container", support: "rendered" },
  "grid-item": { kind: "container", support: "rendered" },

  // Typography. `text`/`title`/`caption` are the compiled form of a Markdown paragraph,
  // heading and aside — containers that hold prose, never members of it.
  title: { kind: "container", support: "rendered" },
  text: { kind: "container", support: "rendered", svg: true, note: "SVG text inside `<svg>`" },
  caption: { kind: "container", support: "rendered" },
  divider: { kind: "container", support: "rendered" },
  blockquote: { kind: "container", support: "rendered" },

  // Inline atoms — the ones a sentence may contain.
  bold: { kind: "inline", support: "rendered" },
  italic: { kind: "inline", support: "rendered" },
  code: { kind: "inline", support: "rendered" },
  badge: { kind: "inline", support: "rendered" },
  icon: { kind: "inline", support: "rendered" },
  math: { kind: "inline", support: "rendered", note: "`block` attribute for display math" },
  Link: { kind: "inline", support: "rendered" },

  // Code leaves.
  "code-block": {
    kind: "container",
    support: "rendered",
    note: "fence target; ChatGPT uses a client widget instead",
  },
  pre: { kind: "container", support: "fallback", note: "raw text element; not in the corpus" },

  // Lists and tables (produced by Markdown lowering and written directly).
  list: { kind: "container", support: "rendered" },
  "list-item": { kind: "container", support: "rendered" },
  table: { kind: "container", support: "rendered" },
  "table-row": { kind: "container", support: "rendered" },
  "table-cell": { kind: "container", support: "rendered" },

  // Interactive controls (`#48` — reference vocabulary, renderer pending).
  button: { kind: "container", support: "fallback" },
  "radio-group": { kind: "container", support: "fallback" },
  radio: { kind: "container", support: "fallback" },
  label: { kind: "container", support: "fallback" },
  textarea: { kind: "container", support: "fallback" },

  // SVG (`#47`). Every one of these is in `svg-map.ts`'s allowlist.
  svg: { kind: "container", support: "rendered" },
  defs: { kind: "container", support: "rendered", svg: true },
  marker: { kind: "container", support: "rendered", svg: true },
  g: { kind: "container", support: "rendered", svg: true },
  rect: { kind: "container", support: "rendered", svg: true },
  path: { kind: "container", support: "rendered", svg: true },
  line: { kind: "container", support: "rendered", svg: true },
  circle: { kind: "container", support: "rendered", svg: true },
  ellipse: { kind: "container", support: "rendered", svg: true },
  polygon: { kind: "container", support: "rendered", svg: true },
  polyline: { kind: "container", support: "rendered", svg: true },

  // Host-resolved components: resolved server-side and embedded in a sentence.
  Cite: { kind: "inline", support: "fallback" },
  Entity: { kind: "inline", support: "fallback" },
  AsyncImage: { kind: "inline", support: "fallback" },
  AsyncImageGroup: { kind: "inline", support: "fallback" },

  // Internal placeholder for a client-defined widget (a code editor takes over).
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
