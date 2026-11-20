import { Fragment, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { isInlineTag, parseDocument } from "../../core/dil/index";
import { compileDil } from "./compiler";
import {
  CodeBlockLeaf,
  FallbackBlock,
  FallbackBlockquote,
  FallbackInline,
  FallbackLink,
  FallbackList,
  FallbackListItem,
  FallbackTable,
  FallbackTableCell,
  FallbackTableRow,
  MarkdownImage,
  MathLeaf,
} from "./primitives/content";
import { ControlButton, ControlLabel, ControlRadio, ControlRadioGroup, ControlTextarea } from "./primitives/controls";
import { Box, Col, Divider, Grid, GridItem, Row } from "./primitives/layout";
import { SvgElement } from "./primitives/svg";
import { Badge, Bold, Caption, Icon, InlineCode, Italic, Text, Title } from "./primitives/typography";
import type { ResolvedNode, ResolvedProps } from "./render-tree";
import { DilSandbox } from "./runtime";
import { DilHostContext, DilRuntimeContext } from "./runtime-context";
import { isSvgTag, svgIdPrefix } from "./svg-map";
import { layoutSkin, textSkin } from "./tokens";

export interface DilRendererProps {
  /** Raw DIL source, exactly as the model wrote it (Markdown + DIL mixed). */
  readonly source: string;
  /** True while tokens are still arriving; enables the throttle and tail repair. */
  readonly isStreaming?: boolean;
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
}: DilRendererProps) {
  const instance = useId();
  const host = useContext(DilHostContext);
  const hostRef = useRef(host);
  hostRef.current = host;
  const text = useThrottledText(source, isStreaming, throttleMs);
  const compiled = useMemo(() => compileDil(parseDocument(text, { isStreaming })), [text, isStreaming]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<readonly ResolvedNode[]>();
  const [runtime] = useState(() => new DilSandbox(setSnapshot, () => hostRef.current));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => runtime.setVisible(entry.isIntersecting), {
      rootMargin: "0px 0px 400px 0px",
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      runtime.setVisible(false);
      runtime.stop();
    };
  }, [runtime]);

  useEffect(() => {
    runtime.update(compiled.program);
  }, [runtime, compiled.program]);

  const value = useMemo(() => ({ runtime, host }), [runtime, host]);
  return (
    <DilRuntimeContext.Provider value={value}>
      <div ref={rootRef} className={cn("dil-root flex min-w-0 flex-col gap-2 text-sm leading-6", className)}>
        {compiled.program && !snapshot ? (
          <MessageResponse>{compiled.fallback}</MessageResponse>
        ) : (
          renderNodes(compiled.program && snapshot ? snapshot : compiled.tree, instance, null)
        )}
      </div>
    </DilRuntimeContext.Provider>
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

  return isStreaming ? published : source;
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
        <Title key={key} {...skin} level={node.synthetic ? props.level : undefined}>
          {rendered}
        </Title>
      );
    case "text":
      if (node.synthetic && props.lineThrough === true) return <del key={key}>{rendered}</del>;
      return (
        <Text key={key} {...skin} as={node.synthetic ? "p" : undefined}>
          {rendered}
        </Text>
      );
    case "hard-break":
      return <br key={key} />;
    case "markdown-literal":
      return (
        <span className="whitespace-pre-wrap wrap-anywhere" key={key}>
          {rendered}
        </span>
      );
    case "markdown-image": {
      const src = textValue(props.src);
      return (
        <MarkdownImage
          key={`${key}.${src}`}
          src={src}
          alt={textValue(props.alt)}
          title={textValue(props.title) || undefined}
        />
      );
    }
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
      return (
        <FallbackListItem key={key} props={props}>
          {rendered}
        </FallbackListItem>
      );
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
        <FallbackLink key={key} props={props} markdown={node.synthetic}>
          {rendered}
        </FallbackLink>
      );

    // Interactive controls (`#48`). Their behaviour comes from the document runtime, so
    // the props they receive are exactly the resolved ones — no skin, no adaptation.
    case "button":
      return (
        <ControlButton key={key} props={props}>
          {rendered}
        </ControlButton>
      );
    case "radio-group":
      return (
        <ControlRadioGroup key={key} props={props}>
          {rendered}
        </ControlRadioGroup>
      );
    case "radio":
      return (
        <ControlRadio key={key} props={props}>
          {rendered}
        </ControlRadio>
      );
    case "label":
      return (
        <ControlLabel key={key} props={props}>
          {rendered}
        </ControlLabel>
      );
    case "textarea":
      return <ControlTextarea key={key} props={props} />;

    default:
      break;
  }

  if (CODE_FAMILY.has(name)) {
    // Primitives, not nodes: `memo` skips a block that finished while the tail streamed.
    if (name === "math") {
      return (
        <MathLeaf
          key={key}
          value={textValue(props.value)}
          block={props.block === true}
          closed={props.closed !== false}
        />
      );
    }
    if (name === "CodeBlock") {
      // The model's `<CodeBlock>` carries its own padding newlines; a fence does not.
      return (
        <CodeBlockLeaf
          key={key}
          code={plainText(children).replace(/^\n+|\n+$/g, "")}
          language={textValue(props.language) || undefined}
          closed={props.closed !== false}
        />
      );
    }
    return (
      <CodeBlockLeaf
        key={key}
        code={plainText(children)}
        language={textValue(props.language) || undefined}
        closed={props.closed !== false}
      />
    );
  }

  const Fallback = isInlineTag(name) ? FallbackInline : FallbackBlock;
  return <Fallback key={key}>{rendered}</Fallback>;
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
