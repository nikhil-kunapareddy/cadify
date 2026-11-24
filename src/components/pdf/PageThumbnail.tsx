import { useEffect, useRef, useState } from "react";
import { renderThumbnail, type PdfDocument } from "@/services/pdf/pdfService";
import { cn } from "@/utils/cn";

const cache = new Map<string, string>();

interface PageThumbnailProps {
  doc: PdfDocument;
  page: number;
  selected: boolean;
  onSelect: () => void;
  aspect: number;
}

/** Lazily rendered page preview. Renders only once scrolled into view. */
export function PageThumbnail({ doc, page, selected, onSelect, aspect }: PageThumbnailProps) {
  const key = `${doc.fingerprints[0] ?? "doc"}:${page}`;
  const [rendered, setRendered] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const own = rendered?.key === key ? rendered : null;
  const src = cache.get(key) ?? own?.url ?? null;
  const failed = own?.failed ?? false;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cache.has(key)) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        renderThumbnail(doc, page, 440)
          .then((url) => {
            cache.set(key, url);
            if (!cancelled) setRendered({ key, url, failed: false });
          })
          .catch(() => !cancelled && setRendered({ key, url: null, failed: true }));
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [doc, page, key]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={`Page ${page}`}
      aria-current={selected ? "page" : undefined}
      className="group flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 outline-none hover:bg-hover focus-visible:bg-hover"
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-[3px] bg-paper ring-1 transition-shadow duration-100",
          selected ? "ring-2 ring-accent" : "ring-line-strong group-hover:ring-fg-faint",
        )}
        style={{ aspectRatio: String(aspect) }}
      >
        {src ? (
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        ) : (
          <div className={cn("absolute inset-0", failed ? "bg-danger-soft" : "animate-pulse-soft bg-[#f2f2f3]")} />
        )}
      </div>
      <span className={cn("tabular text-xs", selected ? "font-medium text-fg" : "text-fg-subtle")}>{page}</span>
    </button>
  );
}
