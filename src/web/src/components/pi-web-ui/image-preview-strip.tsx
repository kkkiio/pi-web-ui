import { XIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
  const [preview, setPreview] = useState<PromptImage | null>(null);

  if (!images?.length) return null;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {images.map((image, index) => (
          <div
            className="relative size-16 overflow-hidden rounded-md border bg-muted"
            key={`${image.mimeType}-${image.data.slice(0, 64)}`}
          >
            <button
              aria-label="Open image preview"
              className="size-full cursor-zoom-in"
              onClick={() => setPreview(image)}
              type="button"
            >
              <img
                alt="Attached"
                className="size-full object-cover"
                src={`data:${image.mimeType};base64,${image.data}`}
              />
            </button>
            {!readonly && (
              <button
                className="absolute right-1 top-1 rounded bg-background/80 p-0.5"
                onClick={() => onRemove?.(index)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Dialog onOpenChange={(open) => !open && setPreview(null)} open={preview !== null}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] gap-1 p-2 sm:max-w-[90vw]" showCloseButton={false}>
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          <div className="flex justify-end">
            <DialogClose
              aria-label="Close image preview"
              className="rounded-xs p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-4" />
            </DialogClose>
          </div>
          {preview && (
            <img
              alt="Preview"
              className="max-h-[80vh] max-w-full rounded-sm object-contain"
              src={`data:${preview.mimeType};base64,${preview.data}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
