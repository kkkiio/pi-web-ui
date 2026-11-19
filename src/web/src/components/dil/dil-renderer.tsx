/**
 * `<DilRenderer>` — the end-to-end loop: `parseDocument` → safe evaluation → React.
 *
 * One component, three stages (`README.md` records why they are staged this way):
 *
 *   1. throttle   while `isStreaming`, publish the text at most every ~60 ms; when the
 *                 stream ends, publish the final text immediately (no trailing wait).
 *   2. parse      `parseDocument(text)` — a pure function of the string, ~1 ms, so there
 *                 is no incremental parse and no cached block to invalidate.
 *   3. resolve    `evaluateStatements` for the `{@body}` scope, then `resolveNodes` to
 *                 expand `{#each}` / `{#if}` / `{expr}` before React sees anything.
 *
 * Then React renders plain elements: layout and typography primitives for the #46
 * vocabulary, readable fallbacks for the slices that follow (`#47` SVG, `#48` controls,
 * `#49` document/data primitives).
 *
 * Pure logic lives in `resolve.ts` and `tokens.ts` and is unit-tested in Node; this file
 * is only JSX glue.
 */

import { Fragment, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { collectStatements, evaluateStatements, hasDilElements, parseDocument } from "../../core/dil/index";
import {
  CodeBlockLeaf,
  FallbackBlock,
  FallbackBlockquote,
  FallbackLink,
  FallbackList,
  FallbackListItem,
  FallbackTable,
  FallbackTableCell,
  FallbackTableRow,
  MathLeaf,
} from "./primitives/content";
import { Box, Col, Divider, Grid, GridItem, Row } from "./primitives/layout";
import { SvgElement } from "./primitives/svg";
import { Badge, Bold, Caption, Icon, InlineCode, Italic, Text, Title } from "./primitives/typography";
import { type ResolvedNode, type ResolvedProps, resolveNodes } from "./resolve";
import { isSvgTag, svgIdPrefix } from "./svg-map";
import { layoutSkin, textSkin } from "./tokens";

export interface DilRendererProps {
  /** Raw DIL source, exactly as the model wrote it (Markdown + DIL mixed). */
  readonly source: string;
  /** True while tokens are still arriving; enables the throttle and tail repair. */
  readonly isStreaming?: boolean;
  /**
   * Renderer for answers that contain no DIL (plain Markdown). Called with the throttled
   * text so the message view keeps one transcript component for both shapes.
   */
  readonly markdown?: (text: string) => ReactNode;
  /** Throttle window in ms while streaming. Default 60 (see README). */
  readonly throttleMs?: number;
  readonly className?: string;
}

const DEFAULT_THROTTLE_MS = 60;

export function DilRenderer({
  source,
  isStreaming = false,
  throttleMs = DEFAULT_THROTTLE_MS,
  className,
  markdown,
}: DilRendererProps) {
  // Render keys are only unique inside this instance; SVGs in two messages would
  // otherwise share `dil-n-0-arrow` and the second marker reference would resolve to the
  // first diagram. `useId` gives every message its own namespace.
  const instance = useId();
  const text = useThrottledText(source, isStreaming, throttleMs);
  const document = useMemo(() => parseDocument(text), [text]);
  const dil = useMemo(() => hasDilElements(document.tree), [document]);

  // Plain Markdown never pays for statement evaluation or tree resolution.
  const statements = useMemo(() => (dil ? collectStatements(document.raw) : []), [dil, document]);
  const scope = useMemo(() => (dil ? evaluateStatements(statements) : {}), [dil, statements]);
  const resolved = useMemo(() => (dil ? resolveNodes(document.tree, scope) : []), [dil, document, scope]);

  if (!dil && markdown) return <>{markdown(text)}</>;

  return (
    <div className={cn("dil-root flex min-w-0 flex-col gap-2 text-sm leading-6", className)}>
      {renderNodes(resolved, instance, null)}
    </div>
  );
}

/**
 * Leading + trailing throttle. A plain debounce would starve while tokens arrive faster
 * than the window; a plain throttle would drop the newest text. This publishes the first
 * change immediately, then at most once per window, and always publishes the latest
 * pending text at the boundary.
 */
export function useThrottledText(source: string, isStreaming: boolean, throttleMs: number): string {
  const [published, setPublished] = useState(source);
  const latest = useRef(source);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRun = useRef(0);

  useEffect(() => {
    latest.current = source;

    const cancel = (): void => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    if (!isStreaming) {
      // The stream finished: the final text never waits for a window.
      cancel();
      lastRun.current = Date.now();
      setPublished(source);
      return;
    }

    const elapsed = Date.now() - lastRun.current;
    const publish = (): void => {
      timer.current = null;
      lastRun.current = Date.now();
      setPublished(latest.current);
    };

    if (elapsed >= throttleMs) {
      publish();
      return;
    }
    if (timer.current === null) timer.current = setTimeout(publish, throttleMs - elapsed);

    return cancel;
  }, [source, isStreaming, throttleMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return published;
}

// ---------------------------------------------------------------------------
// Resolved node → JSX
// ---------------------------------------------------------------------------

const CODE_FAMILY: ReadonlySet<string> = new Set(["code-block", "CodeBlock", "math"]);

/**
 * Inside `<svg>`, every child is SVG: geometry is a child element, and a DIL container in
 * there has no meaning. The id prefix is per diagram so two messages that both define
 * `<marker id="arrow">` do not collide.
 */
interface SvgContext {
  readonly idPrefix: string;
}

function renderNodes(nodes: readonly ResolvedNode[], prefix: string, svg: SvgContext | null) {
  return nodes.map((node, index) => renderNode(node, `${prefix}.${index}`, svg));
}

function renderNode(node: ResolvedNode, key: string, svg: SvgContext | null) {
  if (node.kind === "text") return node.value;

  const { name, props, children } = node;

  if (svg) {
    const inner = renderNodes(children, key, svg);
    // `<text>` is an SVG text node in here, not the typography primitive.
    if (!isSvgTag(name)) return <Fragment key={key}>{inner}</Fragment>;
    return (
      <SvgElement key={key} name={name} props={props} idPrefix={svg.idPrefix}>
        {inner}
      </SvgElement>
    );
  }

  if (name === "svg") {
    const idPrefix = svgIdPrefix(key);
    return (
      <SvgElement key={key} name="svg" props={props} idPrefix={idPrefix}>
        {renderNodes(children, key, { idPrefix })}
      </SvgElement>
    );
  }

  const skin = skinFor(name, props);
  const rendered = renderNodes(children, key, null);

  switch (name) {
    case "box":
      return (
        <Box key={key} {...skin}>
          {rendered}
        </Box>
      );
    case "row":
      return (
        <Row key={key} {...skin}>
          {rendered}
        </Row>
      );
    case "col":
      return (
        <Col key={key} {...skin}>
          {rendered}
        </Col>
      );
    case "grid":
      return (
        <Grid key={key} {...skin}>
          {rendered}
        </Grid>
      );
    case "grid-item":
      return (
        <GridItem key={key} {...skin}>
          {rendered}
        </GridItem>
      );
    case "divider":
      return <Divider key={key} {...skin} />;

    case "title":
      return (
        <Title key={key} {...skin}>
          {rendered}
        </Title>
      );
    case "text":
      return (
        <Text key={key} {...skin}>
          {rendered}
        </Text>
      );
    case "caption":
      return (
        <Caption key={key} {...skin}>
          {rendered}
        </Caption>
      );
    case "badge":
      return (
        <Badge key={key} {...skin}>
          {rendered}
        </Badge>
      );
    case "bold":
      return (
        <Bold key={key} {...skin}>
          {rendered}
        </Bold>
      );
    case "italic":
      return (
        <Italic key={key} {...skin}>
          {rendered}
        </Italic>
      );
    case "code":
      return (
        <InlineCode key={key} {...skin}>
          {rendered}
        </InlineCode>
      );
    case "icon":
      return <Icon key={key} {...skin} name={props.name} label={iconLabel(props)} />;

    case "list":
      return (
        <FallbackList key={key} props={props}>
          {rendered}
        </FallbackList>
      );
    case "list-item":
      return <FallbackListItem key={key}>{rendered}</FallbackListItem>;
    case "table":
      return <FallbackTable key={key}>{rendered}</FallbackTable>;
    case "table-row":
      return <FallbackTableRow key={key}>{rendered}</FallbackTableRow>;
    case "table-cell":
      return (
        <FallbackTableCell key={key} props={props}>
          {rendered}
        </FallbackTableCell>
      );
    case "blockquote":
      return <FallbackBlockquote key={key}>{rendered}</FallbackBlockquote>;
    case "Link":
      return (
        <FallbackLink key={key} props={props}>
          {rendered}
        </FallbackLink>
      );

    default:
      break;
  }

  if (CODE_FAMILY.has(name)) {
    // Primitives, not nodes: `memo` skips a block that finished while the tail streamed.
    if (name === "math") {
      return <MathLeaf key={key} value={textValue(props.value)} block={props.block === true} />;
    }
    if (name === "CodeBlock") {
      // The model's `<CodeBlock>` carries its own padding newlines; a fence does not.
      return (
        <CodeBlockLeaf
          key={key}
          code={plainText(children).replace(/^\n+|\n+$/g, "")}
          language={textValue(props.language) || undefined}
        />
      );
    }
    return <CodeBlockLeaf key={key} code={plainText(children)} language={textValue(props.language) || undefined} />;
  }

  return <FallbackBlock key={key}>{rendered}</FallbackBlock>;
}

function skinFor(name: string, props: ResolvedProps) {
  switch (name) {
    case "box":
    case "row":
    case "col":
    case "grid":
    case "grid-item":
    case "divider":
      return layoutSkin(name, props);
    case "title":
    case "text":
    case "caption":
    case "badge":
    case "code":
    case "icon":
      return textSkin(name, props);
    default:
      return { className: undefined, style: undefined };
  }
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

/** `icon name="…"` is the DIL spelling; `aria-label` covers the accessibility variant. */
function iconLabel(props: ResolvedProps): string | undefined {
  const label = props["aria-label"] ?? props.label;
  return typeof label === "string" && label.trim() ? label : undefined;
}

function plainText(nodes: readonly ResolvedNode[]): string {
  return nodes.map((node) => (node.kind === "text" ? node.value : plainText(node.children))).join("");
}
