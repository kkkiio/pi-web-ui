import { XIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PromptImage } from "../../core/types";

export function ImagePreviewStrip({
  images,
  onRemove,
  readonly = false,
}: {
  images?: PromptImage[];
  onRemove?: (index: number) => void;
  readonly?: boolean;
}) {
  if (!images?.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {images.map((image, index) => {
        const src = `data:${image.mimeType};base64,${image.data}`;
        const label = `Image ${index + 1}`;
        return (
          <div
            className="relative size-16 rounded-md border bg-muted"
            // biome-ignore lint/suspicious/noArrayIndexKey: attachments are an ordered list and may contain the same image more than once
            key={index}
          >
            <Dialog>
              <DialogTrigger asChild>
                <button
                  aria-label={`View ${label.toLowerCase()}`}
                  className="size-full cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                  type="button"
                >
                  <img alt={label} className="size-full rounded-md object-contain" loading="lazy" src={src} />
                </button>
              </DialogTrigger>
              <DialogContent
                aria-describedby={undefined}
                className="w-max max-w-[min(64rem,calc(100%_-_2rem))] grid-cols-1 gap-0 p-3 pt-10 sm:max-w-[min(64rem,calc(100%_-_2rem))]"
              >
                <DialogTitle className="sr-only">{label}</DialogTitle>
                <img alt={label} className="max-h-[calc(100dvh-6rem)] max-w-full object-contain" src={src} />
              </DialogContent>
            </Dialog>
            {!readonly && (
              <button
                aria-label={`Remove ${label.toLowerCase()}`}
                className="absolute right-1 top-1 rounded bg-background/80 p-0.5"
                onClick={() => onRemove?.(index)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
