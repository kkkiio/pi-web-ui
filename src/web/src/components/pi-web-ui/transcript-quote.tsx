import { QuoteIcon, XIcon } from "lucide-react";
import { nanoid } from "nanoid";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type TranscriptQuote = { id: string; source: string; text: string };

export function formatQuotedPrompt(text: string, quotes: TranscriptQuote[]) {
  return [
    ...quotes.map(
      (quote) =>
        `Quoted from ${quote.source}:\n${quote.text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}`,
    ),
    text.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function quoteSource(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  if (element?.closest('button, input, textarea, [contenteditable="true"]')) return null;
  return element?.closest<HTMLElement>("[data-quote-source]") ?? null;
}

export function TranscriptQuoteAction({
  transcriptRef,
  disabled,
  onQuote,
}: {
  transcriptRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onQuote: (quote: TranscriptQuote) => void;
}) {
  const [selection, setSelection] = useState<{ text: string; source: string; left: number; top: number } | null>(null);

  useEffect(() => {
    if (disabled) {
      setSelection(null);
      return;
    }
    const update = () => {
      const selected = window.getSelection();
      const start = quoteSource(selected?.anchorNode ?? null);
      const end = quoteSource(selected?.focusNode ?? null);
      if (
        !selected ||
        selected.isCollapsed ||
        !selected.rangeCount ||
        !selected.toString().trim() ||
        !start ||
        !end ||
        !transcriptRef.current?.contains(start) ||
        !transcriptRef.current.contains(end)
      ) {
        setSelection(null);
        return;
      }
      const rect = selected.getRangeAt(0).getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setSelection(null);
        return;
      }
      setSelection({
        text: selected.toString(),
        source: start === end ? start.dataset.quoteSource || "Transcript" : "Transcript",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)),
        top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 48)),
      });
    };
    const dismiss = () => setSelection(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.getSelection()?.toString()) {
        dismiss();
        window.getSelection()?.removeAllRanges();
        event.stopPropagation();
      }
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [disabled, transcriptRef]);

  if (!selection || disabled) return null;
  return createPortal(
    <Button
      className="fixed z-50 shadow-md"
      style={{ left: selection.left, top: selection.top }}
      type="button"
      size="sm"
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        onQuote({ id: nanoid(), text: selection.text, source: selection.source });
        setSelection(null);
        window.getSelection()?.removeAllRanges();
      }}
    >
      <QuoteIcon className="size-4" /> Add to Chat
    </Button>,
    document.body,
  );
}

export function TranscriptQuotePreview({
  quotes,
  onRemove,
}: {
  quotes: TranscriptQuote[];
  onRemove: (id: string) => void;
}) {
  if (!quotes.length) return null;
  return (
    <div
      role="group"
      aria-label="Quoted selections"
      className="mx-3 mt-3 max-h-32 min-w-0 self-stretch space-y-2 overflow-y-auto"
    >
      {quotes.map((quote) => (
        <div className="flex min-w-0 gap-2 rounded-md border bg-muted/40 p-2 text-xs" key={quote.id}>
          <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 font-medium text-muted-foreground">{quote.source}</div>
            <blockquote className="max-h-16 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {quote.text}
            </blockquote>
          </div>
          <button
            aria-label="Remove quote"
            className="self-start rounded p-1 hover:bg-muted"
            onClick={() => onRemove(quote.id)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
