import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Responsive collage/gallery for multi-image posts with a full-screen viewer.
 * Media is lazy-loaded and only the first image is eager, so a long feed never
 * downloads media the reader has not reached.
 */

interface Props {
  urls: string[];
  alt?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

const GRID_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2",
  4: "grid-cols-2",
};

export function MediaGallery({ urls, alt = "Post media", className, onOpenChange }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const items = urls.filter(Boolean);
  const shown = items.slice(0, 4);
  const overflow = items.length - shown.length;

  const close = useCallback(() => {
    setLightbox(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const step = useCallback(
    (delta: number) =>
      setLightbox((current) =>
        current === null ? current : (current + delta + items.length) % items.length,
      ),
    [items.length],
  );

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, step]);

  if (!items.length) return null;

  return (
    <>
      <div
        className={cn(
          "grid gap-0.5 overflow-hidden bg-muted/30",
          GRID_CLASS[Math.min(shown.length, 4)] ?? "grid-cols-2",
          className,
        )}
      >
        {shown.map((url, index) => {
          const isTallFirstOfThree = shown.length === 3 && index === 0;
          return (
            <button
              key={`${url}-${index}`}
              type="button"
              aria-label={`${alt} ${index + 1} of ${items.length}`}
              onClick={() => {
                setLightbox(index);
                onOpenChange?.(true);
              }}
              className={cn(
                "relative block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isTallFirstOfThree && "row-span-2",
              )}
            >
              <img
                src={url}
                alt={`${alt} ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className={cn(
                  "h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]",
                  shown.length === 1 ? "max-h-[600px]" : "aspect-square",
                  isTallFirstOfThree && "aspect-auto",
                )}
              />
              {overflow > 0 && index === shown.length - 1 && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-2xl font-bold backdrop-blur-[2px]">
                  +{overflow}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lightbox !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Media viewer"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          onClick={close}
        >
          <button
            type="button"
            aria-label="Close viewer"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-secondary/70 p-2 text-foreground hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>

          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 rounded-full bg-secondary/70 p-2 hover:bg-secondary"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 rounded-full bg-secondary/70 p-2 hover:bg-secondary"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <img
            src={items[lightbox]}
            alt={`${alt} ${lightbox + 1}`}
            className="max-h-[88vh] max-w-[94vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />

          <span className="absolute bottom-5 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium">
            {lightbox + 1} / {items.length}
          </span>
        </div>
      )}
    </>
  );
}
