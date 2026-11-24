import { Box, Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { useGenerationStore } from "@/stores/generationStore";
import { useThemeStore } from "@/stores/themeStore";
import { VIEWER_BACKGROUNDS, useViewerStore } from "@/stores/viewerStore";
import { useElementSize } from "@/hooks/useElementSize";
import { cn } from "@/utils/cn";
import { formatCount, formatLength } from "@/utils/format";
import { parseStl, type MeshData } from "./parseStl";
import { ViewerEngine, type ViewPreset } from "./viewerEngine";
import { ViewerToolbar, ViewPresetBar } from "./ViewerToolbar";

type MeshState = { status: "idle" | "parsing" | "ready" } | { status: "error"; message: string };

/** Parse outcome, tagged with the bytes it belongs to. */
interface ParsedMesh {
  bytes: Uint8Array;
  status: "ready" | "error";
  message?: string;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function ModelViewer() {
  const engineRef = useRef<ViewerEngine | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(rootRef);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(0);
  const [parsed, setParsed] = useState<ParsedMesh | null>(null);

  const preview = useGenerationStore((s) => s.preview);
  const result = useGenerationStore((s) => s.result);
  const loadPreview = useGenerationStore((s) => s.loadPreview);
  const settings = useViewerStore();
  const themeDark = useThemeStore((s) => s.resolved === "dark");

  // Engine lifecycle is tied to the container node (React 19 ref cleanup).
  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    let engine: ViewerEngine;
    try {
      engine = new ViewerEngine(el);
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "WebGL is not available.");
      return;
    }
    engine.onContextLost = () => setEngineError("The graphics context was lost. Reopen the 3D view to continue.");
    engineRef.current = engine;
    setEngineReady((n) => n + 1);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const bytes = preview.status === "ready" ? (preview.bytes ?? null) : null;
  const mesh: MeshState = !bytes
    ? { status: "idle" }
    : parsed?.bytes !== bytes
      ? { status: "parsing" }
      : parsed.status === "ready"
        ? { status: "ready" }
        : { status: "error", message: parsed.message ?? "The preview mesh could not be parsed." };

  // Mesh loading (parsed in a worker)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!bytes) {
      engine.setMesh(null);
      return;
    }
    let cancelled = false;
    parseStl(bytes)
      .then((data: MeshData) => {
        if (cancelled) return;
        engine.setMesh(data);
        setParsed({ bytes, status: "ready" });
      })
      .catch((err: Error) => {
        if (!cancelled) setParsed({ bytes, status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [bytes, engineReady]);

  useEffect(() => {
    engineRef.current?.setSettings({
      grid: settings.grid,
      axes: settings.axes,
      display: settings.display,
      projection: settings.projection,
    });
  }, [settings.grid, settings.axes, settings.display, settings.projection, engineReady]);

  useEffect(() => {
    const bg =
      settings.background === "theme"
        ? { background: themeDark ? "#15161a" : "#dfe0e3", dark: themeDark }
        : { background: VIEWER_BACKGROUNDS[settings.background].color, dark: VIEWER_BACKGROUNDS[settings.background].dark };
    engineRef.current?.setAppearance(bg);
  }, [settings.background, themeDark, engineReady]);

  // Viewer keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      const engine = engineRef.current;
      if (!engine || mesh.status !== "ready") return;
      const s = useViewerStore.getState();
      const views: Record<string, ViewPreset> = { "1": "front", "3": "right", "7": "top", "0": "iso" };
      const key = e.key.toLowerCase();
      if (views[key]) engine.setView(views[key]);
      else if (key === "f") engine.fit();
      else if (key === "o") s.set({ projection: s.projection === "perspective" ? "orthographic" : "perspective" });
      else if (key === "g") s.set({ grid: !s.grid });
      else if (key === "a") s.set({ axes: !s.axes });
      else if (key === "w") s.set({ display: s.display === "wireframe" ? "shaded-edges" : "wireframe" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mesh.status]);

  const ready = mesh.status === "ready" && !engineError;
  // Narrow panes (split view) stack overlays so nothing collides with the toolbar.
  const compact = size.width > 0 && size.width < 860;
  const dims = result?.dimensions;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-viewport" data-testid="model-viewer">
      <div ref={attachContainer} className="absolute inset-0" tabIndex={-1} aria-label="3D model viewport" />

      {engineError && (
        <div className="absolute inset-0 grid place-items-center bg-viewport">
          <ErrorState title="3D view unavailable" description={engineError} />
        </div>
      )}

      {!engineError && (preview.status === "loading" || mesh.status === "parsing") && (
        <div className="absolute inset-0 grid place-items-center bg-viewport/70">
          <LoadingState label={preview.status === "loading" ? "Loading model…" : "Preparing preview mesh…"} />
        </div>
      )}

      {!engineError && (preview.status === "error" || mesh.status === "error") && (
        <div className="absolute inset-0 grid place-items-center bg-viewport">
          <ErrorState
            title="Preview mesh could not be loaded"
            description={mesh.status === "error" ? mesh.message : preview.error?.message}
            action={
              <Button size="sm" onClick={() => void loadPreview()}>
                Try again
              </Button>
            }
          />
        </div>
      )}

      {!engineError && preview.status === "idle" && !result && (
        <div className="absolute inset-0 grid place-items-center bg-viewport">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-panel text-fg-subtle">
              <Box size={20} />
            </div>
            <div>
              <p className="text-base font-medium text-fg">No model yet</p>
              <p className="mt-1 max-w-[260px] text-sm text-fg-subtle">Generate a 3D model from the drawing to inspect it here.</p>
            </div>
          </div>
        </div>
      )}

      {ready && (
        <>
          <div className={cn("pointer-events-none absolute top-3 left-3 flex gap-2", compact ? "flex-col items-start" : "items-center")}>
            <Tooltip
              side="bottom"
              align="start"
              content="Tessellated STL mesh for visualization only. The STEP export contains the exact B-rep geometry."
            >
              <div className="surface-glass pointer-events-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted shadow-sm ring-1 ring-line">
                <Box size={13} className="text-fg-subtle" />
                <span className="font-medium text-fg">Preview mesh</span>
                {!compact && (
                  <>
                    <span className="text-fg-faint">·</span>
                    <span className="tabular">{formatCount(result?.preview.triangleCount ?? 0)} triangles</span>
                  </>
                )}
                <Info size={12} className="text-fg-faint" />
              </div>
            </Tooltip>
            {result?.backend === "mock" && (
              <Tooltip content="Generated by the mock backend from bundled sample data, not from your drawing.">
                <div className="pointer-events-auto flex h-7 items-center rounded-md bg-warning-soft px-2 text-xs font-medium text-warning ring-1 ring-warning/25">
                  Sample model
                </div>
              </Tooltip>
            )}
          </div>

          <div className="absolute top-3 right-3">
            <ViewPresetBar onView={(v) => engineRef.current?.setView(v)} />
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <ViewerToolbar onFit={() => engineRef.current?.fit()} onReset={() => engineRef.current?.reset()} />
          </div>

          {dims && result && (
            <div
              className={cn(
                "surface-glass absolute flex h-7 items-center gap-1 rounded-md px-2 font-mono text-xs text-fg-muted shadow-sm ring-1 ring-line tabular",
                compact ? "top-[84px] left-3" : "right-3 bottom-3",
              )}
            >
              <span>{formatLength(dims.length, result.units).replace(` ${result.units}`, "")}</span>
              <span className="text-fg-faint">×</span>
              <span>{formatLength(dims.width, result.units).replace(` ${result.units}`, "")}</span>
              <span className="text-fg-faint">×</span>
              <span>{formatLength(dims.height, result.units)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
