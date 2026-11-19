/**
 * Readable fallbacks for the parts of the catalog that later slices own.
 *
 * #46 is the core MVP: layout, typography, control flow. The document/data primitives
 * (`list`, `table`, `blockquote`, `Link`, `math`, `code-block`) are #49, the SVG
 * primitives are #47, and the interactive controls are #48. Until those land, a mixed
 * message still has to read well, so these render plain, well-behaved HTML with the same
 * typography the rest of the transcript uses.
 *
 * Nothing here is a placeholder to throw away: the fallbacks are what a reader gets when
 * a later slice is unavailable. `math` (KaTeX) and `code-block` (Shiki) are the real
 * primitives, so they are `memo`ised on their content rather than re-rendered per token.
 */

import { mermaid } from "@streamdown/mermaid";
import { memo, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import type { BundledLanguage } from "shiki";
import { CodeBlock, CodeBlockCopyButton, CodeBlockHeader } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { isHttpsImageUrl } from "../../../core/dil/markdown";
import { mathHtml } from "../math";
import { layoutSkin, safeLinkUrl } from "../tokens";

interface FallbackProps {
  readonly className?: string;
  readonly children?: ReactNode;
  readonly props?: Readonly<Record<string, unknown>>;
}

export function FallbackList({ props, children }: FallbackProps) {
  const className = cn("my-1 pl-5", "marker:text-muted-foreground", layoutSkin("list", props ?? {}).className);
  if (props?.marker === "number") {
    // `5. Deploy` continues the list it belongs to; dropping `start` renumbers it to 1.
    const start = typeof props.start === "number" ? props.start : Number.parseInt(String(props.start ?? ""), 10);
    return (
      <ol
        start={Number.isInteger(start) && start >= 0 && start !== 1 ? start : undefined}
        className={cn(className, "list-decimal")}
      >
        {children}
      </ol>
    );
  }
  return <ul className={cn(className, "list-disc")}>{children}</ul>;
}

export function FallbackListItem({ children, props }: FallbackProps) {
  const checked = props?.checked;
  if (checked === "true" || checked === "false") {
    return (
      <li className="min-w-0 list-none">
        <div className="flex items-start gap-2">
          <input
            className="mt-1.5 shrink-0"
            type="checkbox"
            checked={checked === "true"}
            disabled
            aria-label="Task status"
          />
          <div className="min-w-0">{children}</div>
        </div>
      </li>
    );
  }
  return <li className="min-w-0">{children}</li>;
}

export function FallbackTable({ children }: FallbackProps) {
  return (
    <div className="my-2 w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function FallbackTableRow({ children }: FallbackProps) {
  return <tr className="border-b border-border/60 last:border-0">{children}</tr>;
}

export function FallbackTableCell({ props, children }: FallbackProps) {
  const align = layoutSkin("table-cell", props ?? {}).className;
  if (props?.header === true) {
    return <th className={cn("px-2 py-1.5 font-medium text-foreground", align || "text-left")}>{children}</th>;
  }
  return <td className={cn("px-2 py-1.5 align-top text-foreground/90", align)}>{children}</td>;
}

export function FallbackBlockquote({ children }: FallbackProps) {
  return <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>;
}

/**
 * The heavy leaves of a transcript: KaTeX and Shiki, `memo`ised on their content so the tail
 * keeps streaming without re-typesetting what already finished (the caching decision in
 * `README.md`). Both render their source while the construct is still open.
 */
export const MathLeaf = memo(function MathLeaf({
  value,
  block,
  closed = true,
}: {
  readonly value: string;
  readonly block: boolean;
  readonly closed?: boolean;
}) {
  const html = useMemo(() => (block && !closed ? null : mathHtml(value, block)), [value, block, closed]);
  if (html === null) {
    if (block) {
      return (
        <pre className="my-2 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </pre>
      );
    }
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{value}</code>;
  }
  // KaTeX output is generated from LaTeX with `trust: false`: it contains no model markup.
  return (
    <span
      className={block ? "my-2 block overflow-x-auto" : "inline"}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output, not model HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/** A fence is highlighted once it closed; while it streams, the plain text is cheaper. */
export const CodeBlockLeaf = memo(function CodeBlockLeaf({
  code,
  language,
  closed = true,
}: {
  readonly code: string;
  readonly language: string | undefined;
  readonly closed?: boolean;
}) {
  if (!closed) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
        {code}
      </pre>
    );
  }
  if (language?.toLowerCase() === "mermaid") return <MermaidDiagram code={code} />;
  return <CopyableCode code={code} language={language} />;
});

function CopyableCode({ code, language }: { readonly code: string; readonly language?: string }) {
  return (
    <CodeBlock className="my-2" code={code} language={(language ?? "text") as BundledLanguage}>
      <CodeBlockHeader className="justify-end py-0.5">
        <CodeBlockCopyButton aria-label="Copy code" />
      </CodeBlockHeader>
    </CodeBlock>
  );
}

function MermaidDiagram({ code }: { readonly code: string }) {
  const id = `dil-mermaid-${useId().replace(/[^\w-]/g, "")}`;
  const [rendered, setRendered] = useState<{ code: string; svg: string }>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { svg } = await mermaid
          .getMermaid({ securityLevel: "strict", suppressErrorRendering: true })
          .render(id, code);
        if (active) setRendered({ code, svg });
      } catch {
        // The source stays visible if the diagram cannot be rendered.
      }
    })();
    return () => {
      active = false;
    };
  }, [code, id]);

  if (rendered?.code !== code) return <CopyableCode code={code} />;
  return (
    <div
      aria-label="Mermaid diagram"
      className="my-2 overflow-x-auto [&>svg]:h-auto [&>svg]:max-w-full"
      role="img"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid sanitizes its generated SVG in strict mode.
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  );
}

export function MarkdownImage({
  src,
  alt,
  title,
}: {
  readonly src: string;
  readonly alt: string;
  readonly title?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !isHttpsImageUrl(src)) return alt;
  return (
    <img
      alt={alt}
      className="inline-block h-auto max-w-full"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
      title={title}
    />
  );
}

export function FallbackLink({ props, children, markdown = false }: FallbackProps & { readonly markdown?: boolean }) {
  const url = safeLinkUrl(props?.url, markdown);
  const title = typeof props?.title === "string" ? props.title : undefined;
  if (!url) return <span className="underline decoration-dotted">{children}</span>;
  return (
    <a
      className="underline decoration-1 decoration-current/40 underline-offset-2 hover:decoration-current"
      href={url}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      {children}
    </a>
  );
}

/** Any tag later slices own: keep its text, keep its layout block, add no behaviour. */
export function FallbackBlock({ children }: FallbackProps) {
  return <div className="min-w-0">{children}</div>;
}

/** Inline tags without a renderer yet keep their content inline. */
export function FallbackInline({ children }: FallbackProps) {
  return <span className="min-w-0">{children}</span>;
}
