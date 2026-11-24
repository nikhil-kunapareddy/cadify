import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ErrorState } from "@/components/ui/States";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { useElementSize } from "@/hooks/useElementSize";
import { pageBaseSize, renderPage, type PdfDocument } from "@/services/pdf/pdfService";
import { cn } from "@/utils/cn";
import { isMac } from "@/utils/platform";
import { PdfToolbar } from "./PdfToolbar";

/** PDF points → CSS px at 100% (96 dpi / 72 dpi). */
export const CSS_PER_PT = 96 / 72;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const PAD = 32;

export type ZoomMode = "fit" | "width" | "custom";

interface PDFViewerProps {
  doc: PdfDocument;
  page: number;
  onPageChange: (page: number) => void;
  /** Enable global keyboard shortcuts (arrows, ⌘+/−/0). */
  keyboard?: boolean;
  compact?: boolean;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function PDFViewer({ doc, page, onPageChange, keyboard = true, compact }: PDFViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(scrollRef);
  // Page geometry and errors are keyed by page so stale results never show.
  const pageKey = `${doc.fingerprints[0] ?? "doc"}:${page}`;
  const [baseState, setBaseState] = useState<{ key: string; width: number; height: number } | null>(null);
  const base = baseState?.key === pageKey ? baseState : null;
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const error = errorState?.key === pageKey ? errorState.message : null;
  const [mode, setMode] = useState<ZoomMode>("fit");
  const [customZoom, setCustomZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const pendingAnchor = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pageBaseSize(doc, page)
      .then((b) => !cancelled && setBaseState({ key: pageKey, ...b }))
      .catch((err: Error) => !cancelled && setErrorState({ key: pageKey, message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [doc, page, pageKey]);

  // Zoom is expressed relative to 100% (true physical size on screen).
  const fitZoom = base && size.width > 0 ? Math.min((size.width - PAD * 2) / base.width, (size.height - PAD * 2) / base.height) / CSS_PER_PT : 1;
  const widthZoom = base && size.width > 0 ? (size.width - PAD * 2) / base.width / CSS_PER_PT : 1;
  const zoom = Math.max(MIN_ZOOM, mode === "fit" ? fitZoom : mode === "width" ? widthZoom : customZoom);
  const scale = zoom * CSS_PER_PT;
  const cssW = base ? Math.floor(base.width * scale) : 0;
  const cssH = base ? Math.floor(base.height * scale) : 0;

  // Re-render the page at the current scale (debounced during rapid zoom).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base || size.width === 0) return;
    let task: { cancel(): void } | null = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      setRendering(true);
      // Render off-screen, then blit, so zooming never flashes a blank page.
      const offscreen = document.createElement("canvas");
      renderPage(doc, page, offscreen, scale)
        .then((r) => {
          if (cancelled) {
            r.cancel();
            return;
          }
          task = r;
          return r.promise;
        })
        .then(() => {
          if (cancelled || offscreen.width === 0) return;
          canvas.width = offscreen.width;
          canvas.height = offscreen.height;
          canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
          offscreen.width = 0;
          offscreen.height = 0;
          setRendering(false);
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setRendering(false);
            setErrorState({ key: pageKey, message: err.message });
          }
        });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [doc, page, pageKey, scale, base, size.width]);

  // Keep the point under the cursor fixed when zooming with the wheel.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = pendingAnchor.current;
    if (!el || !anchor) return;
    pendingAnchor.current = null;
    el.scrollLeft = anchor.px * el.scrollWidth - anchor.x;
    el.scrollTop = anchor.py * el.scrollHeight - anchor.y;
  }, [cssW, cssH]);

  const setZoom = useCallback(
    (next: number, anchor?: { x: number; y: number }) => {
      const el = scrollRef.current;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      if (el && anchor) {
        pendingAnchor.current = {
          x: anchor.x,
          y: anchor.y,
          px: (el.scrollLeft + anchor.x) / el.scrollWidth,
          py: (el.scrollTop + anchor.y) / el.scrollHeight,
        };
      }
      setMode("custom");
      setCustomZoom(clamped);
    },
    [],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const levels = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
      const next = dir > 0 ? levels.find((l) => l > zoom + 0.001) : [...levels].reverse().find((l) => l < zoom - 0.001);
      setZoom(next ?? zoom);
    },
    [zoom, setZoom],
  );

  // Pinch / ⌘-scroll zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      setZoom(zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, setZoom]);

  // Keyboard
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        step(1);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        step(-1);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        setMode("fit");
      } else if (!mod && !e.altKey && (e.key === "ArrowRight" || e.key === "PageDown")) {
        if (page < doc.numPages) {
          e.preventDefault();
          onPageChange(page + 1);
        }
      } else if (!mod && !e.altKey && (e.key === "ArrowLeft" || e.key === "PageUp")) {
        if (page > 1) {
          e.preventDefault();
          onPageChange(page - 1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, step, page, doc.numPages, onPageChange]);

  // Drag to pan
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = scrollRef.current;
    if (!el) return;
    panning.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const p = panning.current;
    if (!el || !p) return;
    el.scrollLeft = p.left - (e.clientX - p.x);
    el.scrollTop = p.top - (e.clientY - p.y);
  };
  const endPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    panning.current = null;
    setIsPanning(false);
    scrollRef.current?.releasePointerCapture(e.pointerId);
  };

  const overflowX = cssW + PAD * 2 > size.width;
  const overflowY = cssH + PAD * 2 > size.height;

  return (
    <div className="relative h-full w-full bg-canvas" data-testid="pdf-viewer">
      <div
        ref={scrollRef}
        className={cn("absolute inset-0 overflow-auto", isPanning ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={() => setMode(mode === "fit" ? "custom" : "fit")}
      >
        <div
          className="flex"
          style={{
            minWidth: "100%",
            minHeight: "100%",
            width: cssW + PAD * 2,
            height: cssH + PAD * 2,
            padding: PAD,
            justifyContent: overflowX ? "flex-start" : "center",
            alignItems: overflowY ? "flex-start" : "center",
          }}
        >
          <canvas
            ref={canvasRef}
            className="block shrink-0 bg-paper shadow-page"
            style={{ width: cssW, height: cssH }}
            aria-label={`Drawing page ${page} of ${doc.numPages}`}
            role="img"
          />
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-canvas">
          <ErrorState title="This page could not be rendered" detail={error} />
        </div>
      )}

      {rendering && (
        <div className="surface-glass pointer-events-none absolute top-3 right-3 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted shadow-sm ring-1 ring-line">
          <Spinner size={12} /> Rendering
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <PdfToolbar
          page={page}
          pageCount={doc.numPages}
          onPageChange={onPageChange}
          zoom={zoom}
          mode={mode}
          onZoomIn={() => step(1)}
          onZoomOut={() => step(-1)}
          onZoom={(z) => setZoom(z)}
          onMode={setMode}
          compact={compact}
        />
      </div>
    </div>
  );
}
